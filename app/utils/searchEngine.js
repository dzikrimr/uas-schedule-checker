import jadwalData from "../data/jadwal_uas.json";
import Fuse from "fuse.js";

const fuse = new Fuse(jadwalData, {
  keys: ["Mata Kuliah"],
  threshold: 0.3,
  ignoreLocation: true,
});

export function cariJadwal(namaMatkulOCR, kelasOCR) {
  if (!namaMatkulOCR) return null;

  const results = fuse.search(namaMatkulOCR);

  if (results.length === 0) return null;

  const match = results.find((res) => {
    const kelasDb = (res.item.Kelas || "").toLowerCase().trim();
    const kelasCari = (kelasOCR || "").toLowerCase().trim();

    return kelasDb === kelasCari;
  });

  return match ? match.item : null;
}