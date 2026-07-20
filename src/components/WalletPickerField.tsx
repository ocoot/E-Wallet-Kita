import React from "react";
import { DropdownField } from "./DropdownField";

export interface WalletPickerOption {
  /** Value disimpan ke form state -- boleh string kosong "" untuk opsi default/umum. */
  value: string;
  /** Label lengkap yang ditampilkan (sudah termasuk emoji ikon, nama, provider, saldo, dst -- terserah caller). */
  label: string;
}

interface WalletPickerFieldProps {
  options: WalletPickerOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Warna aksen fokus/hover -- disesuaikan dengan tema halaman (indigo di kebanyakan form, amber di Tabungan Emas). */
  accent?: "indigo" | "amber";
  placeholder?: string;
  className?: string;
}

/**
 * Dropdown "Pos Dompet" -- wrapper tipis di atas `DropdownField`.
 *
 * Sebelumnya file ini adalah implementasi penuh yang berdiri sendiri (~160
 * baris), duplikat karakter-demi-karakter dari `DropdownField` (portal ke
 * document.body, handler klik-di-luar, handler Escape, animasi buka/tutup,
 * dst -- lihat AUDIT-konsistensi-komponen.md temuan #3). `DropdownField`
 * adalah superset fungsional (mendukung opsi `disabled` per-item dan 4
 * varian aksen warna), jadi file ini sekarang murni memetakan props versi
 * lama (`WalletPickerOption[]`, 2 varian aksen) ke `DropdownField` -- tidak
 * ada logika stateful yang tersisa di sini.
 *
 * Dipakai di semua form yang punya field "Pos Dompet": Catat Mandiri,
 * Tagihan, Tabungan, Cicilan, dan Tabungan Emas.
 */
export const WalletPickerField: React.FC<WalletPickerFieldProps> = ({
  options,
  value,
  onChange,
  disabled = false,
  accent = "indigo",
  placeholder = "—",
  className = "",
}) => {
  return (
    <DropdownField
      options={options}
      value={value}
      onChange={onChange}
      disabled={disabled}
      accent={accent}
      placeholder={placeholder}
      className={className}
    />
  );
};
