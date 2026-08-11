/**
 * Port fungsi-fungsi murni dari Code.gs (tidak bergantung pada layanan GAS).
 * Data tarif TA 2027-2028.
 */

const TARIF_DATA = {
  LANJUTAN: {
    SMP: 32300000, // Primary ke Lower Secondary, 3 tahun
    SMA: 32300000  // Lower Secondary ke Higher Secondary, 3 tahun
  },
  BARU: {
    'Early Years': { 4: 25000000, 3: 20000000, 2: 15000000, 1: 10000000 },
    Primary: { 6: 51000000, 5: 42500000, 4: 34800000, 3: 27100000, 2: 19400000, 1: 15300000 },
    Secondary: { 6: 64500000, 5: 54900000, 4: 46100000, 3: 42600000, 2: 29200000, 1: 22600000 }
  },
  PAKET: {
    'Kelas 4-9': 57750000,
    'Kelas 5-9': 54900000,
    'Kelas 6-9': 46100000
  }
};

/** Mengambil daftar kelas berdasarkan jenjang (port getKelasOptions). */
function getKelasOptions(jenjang) {
  const kelasMap = {
    TK: ['Toddler', 'PG', 'K1', 'K2'],
    SD: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'],
    SMP: ['G7', 'G8', 'G9'],
    SMA: ['G10', 'G11', 'G12']
  };
  return kelasMap[jenjang] || [];
}

/** Menghitung Tarif SSP (port getTarifSSP). */
function getTarifSSP(jenjang, periode, kategori) {
  if (TARIF_DATA.PAKET[periode]) {
    return TARIF_DATA.PAKET[periode];
  }

  if (kategori === 'Lanjutan Internal') {
    return TARIF_DATA.LANJUTAN[jenjang] || 0;
  }

  const periodeInt = parseInt(periode, 10);
  if (isNaN(periodeInt) || periodeInt < 1) return 0;

  let tarifGroup;
  switch (jenjang) {
    case 'SD': tarifGroup = 'Primary'; break;
    case 'SMP': case 'SMA': tarifGroup = 'Secondary'; break;
    case 'TK': tarifGroup = 'Early Years'; break;
    default: return 0;
  }

  const tarif = TARIF_DATA.BARU[tarifGroup] ? TARIF_DATA.BARU[tarifGroup][String(periodeInt)] : undefined;
  return tarif || 0;
}

/** Memformat angka menjadi string Rupiah dengan pemisah titik (port formatRupiah). */
function formatRupiah(angka) {
  if (isNaN(angka)) return '0';
  return parseFloat(angka).toFixed(0).replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');
}

module.exports = { TARIF_DATA, getKelasOptions, getTarifSSP, formatRupiah };
