import { Groq } from "groq-sdk";
import { cariJadwal } from "../../utils/searchEngine";
import { NextResponse } from "next/server";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

function formatData(rawItem) {
  if (!rawItem) return null;

  const rawDate = rawItem['Hari dan Tanggal'] || '';
  const d = new Date(rawDate);
  let hari = '';
  let tanggal = '';

  if (!isNaN(d.getTime())) {
    hari = d.toLocaleDateString('id-ID', { weekday: 'long' });
    tanggal = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  } else {
    hari = rawDate;
    tanggal = rawDate;
  }

  let jamMulai = rawItem['Waktu'] || '-';
  let jamSelesai = '';

  if (jamMulai.includes('-')) {
    const split = jamMulai.split('-');
    jamMulai = split[0].trim();
    jamSelesai = split[1]?.trim();
  }

  return {
    matkul: rawItem['Mata Kuliah'] || '-',
    kelas: rawItem['Kelas'] || '-',
    ruang: rawItem['Ruang'] || '-',
    dosen: rawItem['Dosen'] || '-',
    jadwal: {
      hari: hari,
      tanggal: tanggal,
      jam_mulai: jamMulai,
      jam_selesai: jamSelesai,
    }
  };
}

function extractJSON(raw) {
  let cleaned = raw.replace(/```json|```/gi, "").trim();

  const start = cleaned.indexOf('[');
  if (start === -1) return null;

  let jsonStr = cleaned.substring(start);

  let end = jsonStr.lastIndexOf(']');
  if (end === -1) {
    end = jsonStr.lastIndexOf('}');
    if (end === -1) return null;
    jsonStr = jsonStr.substring(0, end + 1) + ']';
  } else {
    jsonStr = jsonStr.substring(0, end + 1);
  }

  return jsonStr;
}

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json({ error: "No file" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64Image = buffer.toString("base64");

    const prompt = `Baca semua baris jadwal dari gambar. Output JSON array: [{"matkul":"...","kelas":"..."}]. Jangan skip satupun. Jangan markdown.`;

    const response = await groq.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${file.type};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      temperature: 1,
      max_tokens: 1024,
      top_p: 1,
      stream: false,
      stop: null,
    });

    const raw = response.choices[0].message.content;
    const jsonStr = extractJSON(raw);

    if (!jsonStr) {
      console.error("Groq output no JSON found:", raw);
      return NextResponse.json(
        { error: "AI gagal membaca jadwal" },
        { status: 500 }
      );
    }

    let ocrData = [];
    try {
      ocrData = JSON.parse(jsonStr);
    } catch {
      console.error("Groq output invalid JSON:", jsonStr);
      return NextResponse.json(
        { error: "AI gagal membaca jadwal" },
        { status: 500 }
      );
    }

    ocrData = ocrData.filter((item) => item.matkul && item.matkul.trim());
    if (ocrData.length === 0) {
      return NextResponse.json(
        { error: "AI gagal membaca jadwal" },
        { status: 500 }
      );
    }

    const hasilAkhir = ocrData.map((item) => {
      const dbMatch = cariJadwal(item.matkul, item.kelas);

      return {
        input: item,
        status: dbMatch ? "FOUND" : "NOT_FOUND",
        data: dbMatch ? formatData(dbMatch) : null,
      };
    });

    return NextResponse.json({ result: hasilAkhir });

  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}