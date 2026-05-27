import jadwalData from "../data/jadwal_uas.json";
import Fuse from "fuse.js";

const fuse = new Fuse(jadwalData, {
  keys: ["Mata Kuliah"],
  threshold: 0.4,
  ignoreLocation: true,
});

const fuseKelas = new Fuse(jadwalData, {
  keys: ["Kelas"],
  threshold: 0.2,
  ignoreLocation: true,
});

function normalize(s) {
  return (s || "")
    .replace(/^\([A-Z0-9]+\)\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function cariJadwal(namaMatkulOCR, kelasOCR) {
  if (!namaMatkulOCR) return null;

  const nama = normalize(namaMatkulOCR);
  const kelas = normalize(kelasOCR);

  const results = fuse.search(nama);

  if (results.length === 0) return null;

  let match = results.find((res) => {
    return normalize(res.item.Kelas) === kelas;
  });

  if (!match) {
    const kelasResults = fuseKelas.search(kelas);
    match = results.find((res) => {
      return kelasResults.some((kr) => kr.item === res.item);
    });
  }

  if (!match && results.length > 0) {
    match = results[0];
  }

  return match ? match.item : null;
}
