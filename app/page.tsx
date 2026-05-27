'use client';
import { useState, ChangeEvent, DragEvent, useRef, useEffect } from 'react';
import { toPng } from 'html-to-image';

interface JadwalDetail {
  matkul: string;
  kelas: string;
  ruang: string;
  jadwal: {
    hari: string;
    tanggal: string;
    jam_mulai: string;
    jam_selesai: string;
  };
}

interface ScanResult {
  input: { matkul: string; kelas: string };
  status: 'FOUND' | 'NOT_FOUND';
  ocr_name: string;
  ocr_class: string;
  data: JadwalDetail | null;
}

const LoadingSpinner = () => (
  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [jadwal, setJadwal] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isSimpleView, setIsSimpleView] = useState(false);
  const [tickerIndex, setTickerIndex] = useState(0);
  const [tickerAnim, setTickerAnim] = useState('slide-in-up');
  const resultRef = useRef<HTMLDivElement>(null);

  const tickerMessages = [
    'SCREENSHOT-TO-EXAM MAP AUTOMATION',
    'UPLOAD JADWAL — DAPAT HASIL',
    'MALES BUAT SPREADSHEET?',
    'CEK OTOMATIS DENGAN AI',
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setTickerAnim('slide-out-down');
      setTimeout(() => {
        setTickerIndex((prev) => (prev + 1) % tickerMessages.length);
        setTickerAnim('slide-in-up');
      }, 400);
    }, 3000);
    return () => clearInterval(interval);
  }, [tickerMessages.length]);
  const resultsWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const metaViewport = document.querySelector('meta[name="viewport"]');
    if (metaViewport) {
      metaViewport.setAttribute('content', 'width=1280, initial-scale=0.3, maximum-scale=5.0, user-scalable=yes');
    }
    return () => {
      if (metaViewport) metaViewport.setAttribute('content', 'width=device-width, initial-scale=1');
    };
  }, []);

  const formatTanggalLengkap = (hari: string, tanggalRaw: string) => {
    try {
      if (!tanggalRaw) return hari;
      const d = new Date(tanggalRaw);
      if (isNaN(d.getTime())) return `${hari}, ${tanggalRaw}`;
      return `${hari}, ${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    } catch { return `${hari}, ${tanggalRaw}`; }
  };

  const formatTanggalSimpel = (tanggalRaw: string) => {
    try {
      if (!tanggalRaw) return '-';
      const d = new Date(tanggalRaw);
      if (isNaN(d.getTime())) return tanggalRaw;
      return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return tanggalRaw; }
  };

  const handleDownloadImage = async () => {
    if (!resultRef.current) return;
    setDownloading(true);
    try {
      await new Promise(r => setTimeout(r, 100));
      const dataUrl = await toPng(resultRef.current, {
        cacheBust: true,
        backgroundColor: '#ffffff',
        style: { overflow: 'hidden', minWidth: '1024px', width: '1024px', height: 'auto', display: 'block' },
        filter: (node) => !(node as HTMLElement).className?.includes?.('ignore-scan'),
      });
      const link = document.createElement('a');
      link.download = `SKEMA-Jadwal-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error(err);
      alert('Gagal menyimpan gambar. Silakan coba lagi.');
    } finally {
      setDownloading(false);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files?.[0]) setFile(e.dataTransfer.files[0]);
  };
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true); setError(''); setJadwal([]);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/scan', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memproses gambar');
      if (data.result?.length > 0) {
        const seen = new Set();
        const uniq = data.result.filter((item: ScanResult) => {
          const key = `${item.input.matkul}|${item.input.kelas}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        const sorted = uniq.sort((a: ScanResult, b: ScanResult) => {
          if (a.status === 'FOUND' && b.status !== 'FOUND') return -1;
          if (a.status !== 'FOUND' && b.status === 'FOUND') return 1;
          if (a.status === 'FOUND' && b.status === 'FOUND' && a.data && b.data) {
            const dateA = new Date(a.data.jadwal.tanggal).getTime();
            const dateB = new Date(b.data.jadwal.tanggal).getTime();
            if (dateA !== dateB) return dateA - dateB;
            return a.data.jadwal.jam_mulai.localeCompare(b.data.jadwal.jam_mulai);
          }
          return 0;
        });
        setJadwal(sorted);
        setTimeout(() => {
          resultsWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      } else {
        throw new Error('Tidak ditemukan jadwal pada gambar tersebut. Pastikan gambar jelas.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal memproses permintaan';
      setError('Terjadi kesalahan: ' + message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Ticker */}
      <div className="skema-ticker">
        <div className="skema-ticker-inner">
          <span key={tickerIndex} className={`ticker-slide ${tickerAnim}`}>
            {tickerMessages[tickerIndex]}
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="skema-nav">
        <div className="skema-logo">
          SKEMA
          <span>Screenshot-to-Exam Map Automation</span>
        </div>
        <div className="nav-badge">v1.1</div>
      </nav>

      {/* Hero + Upload */}
      <div className="skema-hero">
        {/* Left: Hero copy */}
        <div className="hero-left">
          <h1 className="hero-title">
            Cek Jadwal<br />
            Ujianmu<br />
            Sekarang.
          </h1>
          <p className="hero-desc">
            Upload screenshot jadwal dari SIAM, dan biarkan SKEMA mendeteksi, mencocokan, dan menyusun jadwal ujianmu secara otomatis.
          </p>
          <div className="hero-stats">
            <div>
              <div className="hero-stat-num">01</div>
              <div className="hero-stat-label">Upload</div>
            </div>
            <div>
              <div className="hero-stat-num">02</div>
              <div className="hero-stat-label">Proses</div>
            </div>
            <div>
              <div className="hero-stat-num">03</div>
              <div className="hero-stat-label">Simpan</div>
            </div>
          </div>
        </div>

        {/* Right: Upload card */}
        <div className="upload-card">
          <div className="upload-card-header">
            <div className="upload-card-title">Upload Jadwal</div>
          </div>

            <div className="upload-notice">
            <p>
              Pastikan upload <strong>screenshot penuh</strong> jadwal dari SIAM (termasuk header tabel) agar AI dapat membaca data dengan akurat.
            </p>
          </div>

          <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" id="fileInput" />
          <label htmlFor="fileInput">
            <div
              className={`drop-zone ${isDragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {file ? (
                <>
                  <div className="drop-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div className="drop-label-file">{file.name}</div>
                  <div className="drop-label" style={{ marginTop: 6 }}>Tap untuk ganti</div>
                </>
              ) : (
                <>
                  <div className="drop-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <div className="drop-label-main">Pilih atau drag gambar</div>
                  <div className="drop-label">JPG / PNG</div>
                </>
              )}
            </div>
          </label>

          <button
            onClick={handleUpload}
            disabled={loading || !file}
            className="cta-btn"
          >
            {loading ? (
              <>
                <LoadingSpinner />
                MEMPROSES...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                CARI JADWAL SAYA
              </>
            )}
          </button>

          {error && <div className="error-msg">⚠ {error}</div>}
        </div>
      </div>

      {/* Results */}
      {jadwal.length > 0 && (
        <div ref={resultsWrapRef} className="results-wrap animate-in">
          <div className="results-divider">
            <div className="results-divider-line" />
            <div className="results-divider-label">Hasil Pencarian</div>
            <div className="results-divider-line" />
          </div>

          <div ref={resultRef} className="results-table-wrap">
            {/* Results Header */}
            <div className="results-header">
              <div className="results-header-left">
                <div className="results-title">Jadwal Ujian</div>
                <div className="results-count">
                  {jadwal.filter(j => j.status === 'FOUND').length} DITEMUKAN / {jadwal.length} TOTAL
                </div>
                <div className="sort-note">↑ TERURUT PER TANGGAL</div>
              </div>
              <div className="results-actions">
                <button
                  onClick={() => setIsSimpleView(!isSimpleView)}
                  className="action-btn ignore-scan"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                  </svg>
                  {isSimpleView ? 'Format Standar' : 'Format Simpel'}
                </button>
                <button
                  onClick={handleDownloadImage}
                  disabled={downloading}
                  className="action-btn primary ignore-scan"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {downloading ? 'Menyimpan...' : 'Simpan PNG'}
                </button>
              </div>
            </div>

            {/* Table */}
            {isSimpleView ? (
              <table className="skema-table">
                <thead>
                  <tr>
                    <th>Hari</th>
                    <th>Tanggal</th>
                    <th>Jam</th>
                    <th>Mata Kuliah</th>
                    <th style={{ textAlign: 'center' }}>Kelas</th>
                    <th style={{ textAlign: 'center' }}>Ruang</th>
                  </tr>
                </thead>
                <tbody>
                  {jadwal.map((item, i) => {
                    const found = item.status === 'FOUND';
                    return (
                      <tr key={i} className={!found ? 'not-found' : ''}>
                        <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 13 }}>
                          {found && item.data ? item.data.jadwal.hari : '—'}
                        </td>
                        <td style={{ fontSize: 13 }}>
                          {found && item.data ? formatTanggalSimpel(item.data.jadwal.tanggal) : '—'}
                        </td>
                        <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>
                          {found && item.data ? `${item.data.jadwal.jam_mulai} – ${item.data.jadwal.jam_selesai}` : '—'}
                        </td>
                        <td>
                          <div className="td-matkul-name">
                            {found && item.data ? item.data.matkul : item.ocr_name}
                          </div>
                          {!found && <div className="td-matkul-error">Tidak ditemukan</div>}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`kelas-badge ${!found ? 'empty' : ''}`}>
                            {found && item.data ? item.data.kelas : item.ocr_class || '?'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {found && item.data
                            ? <span className="ruang-pill">{item.data.ruang}</span>
                            : <span style={{ color: '#bbb' }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <table className="skema-table">
                <thead>
                  <tr>
                    <th>Mata Kuliah</th>
                    <th style={{ textAlign: 'center' }}>Kelas</th>
                    <th>Waktu Ujian</th>
                    <th style={{ textAlign: 'center' }}>Ruang</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {jadwal.map((item, i) => {
                    const found = item.status === 'FOUND';
                    return (
                      <tr key={i} className={!found ? 'not-found' : ''}>
                        <td>
                          <div className="td-matkul-name">
                            {found && item.data ? item.data.matkul : item.ocr_name}
                          </div>
                          {!found && <div className="td-matkul-error">Tidak ditemukan di database</div>}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`kelas-badge ${!found ? 'empty' : ''}`}>
                            {found && item.data ? item.data.kelas : item.ocr_class || '?'}
                          </span>
                        </td>
                        <td>
                          {found && item.data ? (
                            <>
                              <div className="time-date">
                                {formatTanggalLengkap(item.data.jadwal.hari, item.data.jadwal.tanggal)}
                              </div>
                              <div className="time-clock">
                                {item.data.jadwal.jam_mulai} – {item.data.jadwal.jam_selesai}
                              </div>
                            </>
                          ) : (
                            <span style={{ color: '#bbb' }}>—</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {found && item.data
                            ? <span className="ruang-pill">{item.data.ruang}</span>
                            : <span style={{ color: '#bbb' }}>—</span>}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {found
                            ? <span className="status-check">✓</span>
                            : <span className="status-cross">✕</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* Footer */}
            <div className="results-footer">
              <div className="legend-item">
                <span style={{ color: '#22a159', fontWeight: 700, fontSize: 16 }}>✓</span>
                Jadwal ditemukan di database
              </div>
              <div className="legend-item">
                <span style={{ color: '#cc4444', fontWeight: 700, fontSize: 14 }}>✕</span>
                Tidak ditemukan / data tidak cocok
              </div>
            </div>
          </div>

          <p className="save-note">
            * TEKAN "SIMPAN PNG" DI HEADER TABEL UNTUK MENGUNDUH JADWAL
          </p>
        </div>
      )}
    </>
  );
}