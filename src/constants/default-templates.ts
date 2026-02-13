/**
 * Default AK006 template configuration.
 *
 * This is the hardcoded original template that was used before the
 * template‐versioning feature was introduced.  It serves as the
 * fallback for letters that were created before ANY template existed
 * in the database.
 */
export function getDefaultAK006Template() {
  return {
    // Letter header
    kementerian: "KEMENTERIAN PENDIDIKAN TINGGI, SAINS,\nDAN TEKNOLOGI",
    universitas: "UNIVERSITAS DIPONEGORO",
    fakultas: "FAKULTAS SAINS DAN MATEMATIKA",
    alamat: "Jalan Prof. Jacub Rais",
    kampus: "Kampus Universitas Diponegoro",
    kota: "Tembalang, Semarang, Kode Pos 50275",
    telepon: "Telp (024) 7474754 Fax (024) 76480690",
    website: "www.fsm.undip.ac.id",
    email: "fsm(at)undip.ac.id",
    // Letter reference info
    lampiran_surat:
      "SURAT EDARAN BERSAMA MENTERI KEUANGAN DAN KEPALA BADAN ADMINISTRASI KEPEGAWAIAN NEGARA",
    nomor_ref_1: "SE.1.38/DJA/1.0/7/80 (NO.SE/117/80)",
    nomor_ref_2: "19/SE/1980",
    tanggal_ref: "7 JULI 1980",
    // Signer info
    signer_name: "Lilik Maryuni, S.E., M.Si.",
    signer_nip: "197808042001122001",
    signer_pangkat: "Pembina / IVa",
    signer_jabatan: "Manajer Bagian Tata Usaha",
    signer_instansi:
      "Fakultas Sains dan Matematika Universitas Diponegoro",
    // Letter number format
    letter_number_format: "...../UN7.F8.4/AK/.../20..",
    // Title
    letter_title: "SURAT PERNYATAAN MASIH KULIAH",
    // Signer position label
    signer_atas_nama: "a.n. Dekan,",
    signer_untuk_beliau: "u.b. Manajer Bagian Tata Usaha,",
  };
}
