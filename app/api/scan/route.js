import { OpenAI } from "openai";
import { cariJadwal } from "../../utils/searchEngine";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

function formatData(rawItem) {
  if (!rawItem) return null;

  let hari = rawItem['Hari dan Tanggal'] || '-';
  let tanggal = '';

  if (hari.includes(',')) {
    const split = hari.split(',');
    hari = split[0].trim();
    tanggal = split[1]?.trim();
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

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json({ error: "No file" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64Image = buffer.toString("base64");

    const prompt = `
Baca gambar jadwal kuliah ini.

Ambil hanya:
- Mata Kuliah
- Kelas

Return JSON array murni seperti ini:
[
  {"matkul": "nama", "kelas": "A"}
]

Jangan pakai markdown, jangan penjelasan.
`;

    const response = await openai.chat.completions.create({
      model: "meta-llama/llama-3.2-11b-vision-instruct",
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
    });

    const text = response.choices[0].message.content
      .replace(/```json|```/g, "")
      .trim();

    let ocrData = [];

    try {
      ocrData = JSON.parse(text);
    } catch (err) {
      console.error("OpenRouter output invalid JSON:", text);
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