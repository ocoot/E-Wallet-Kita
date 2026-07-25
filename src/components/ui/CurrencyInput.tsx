import React, { useCallback, useRef } from "react";
import { Input } from "./Input";

type BaseInputProps = React.ComponentProps<typeof Input>;

interface CurrencyInputProps
  extends Omit<BaseInputProps, "value" | "onChange" | "type" | "inputMode" | "leftIcon"> {
  /**
   * Nilai mentah -- string berisi DIGIT SAJA (mis. "1234567"), tanpa titik
   * pemisah ribuan. Ini disengaja: seluruh state form nominal di codebase
   * ini (Budget/Savings/Installments/BillReminders/dll) sudah menyimpan
   * angka sebagai string mentah dan baru di-`Number(...)`-kan saat submit
   * -- supaya jadi drop-in replacement, komponen ini ikut pola yang sama
   * persis (TIDAK memformat/mengubah bentuk state, cuma TAMPILANNYA saja).
   */
  value: string;
  onValueChange: (digitsOnly: string) => void;
  /** Prefix di kiri field, default "Rp". Isi `null` untuk sembunyikan (mis.
   * kalau field-nya memang bukan Rupiah, seperti mode gram di GoldSavings). */
  prefix?: string | null;
}

/**
 * Input nominal Rupiah dengan format ribuan (titik) yang ter-update SETIAP
 * KETUKAN -- bukan cuma format sekali saat blur/submit. Sebelum ini,
 * sebagian besar form nominal (Budget, Savings, Installments,
 * BillReminders, dll) memakai `<input type="number">` polos yang cuma
 * menampilkan digit mentah selagi diketik ("1500000"), baru terlihat
 * "Rp 1.500.000" di tempat lain (preview/riwayat) setelah tersimpan --
 * beda paling kentara antara "form kalkulator" dan "form app bank"
 * beneran ada persis di titik ini.
 *
 * Cara kerja: value yang DISIMPAN di state form tetap string digit polos
 * (biar tidak perlu ubah shape/validasi di caller manapun) -- yang
 * diformat cuma STRING YANG DITAMPILKAN di dalam `<input>`. Setiap
 * `onChange`, karakter non-digit hasil ketikan (termasuk titik yang baru
 * saja kita render sendiri) dibuang lagi sebelum dikirim ke `onValueChange`,
 * lalu tampilan diformat ulang dari angka bersih itu.
 *
 * Kursor sengaja selalu ditaruh di akhir setelah setiap ketukan -- cukup
 * untuk kasus paling umum (mengetik/menambah nominal dari kiri ke kanan).
 * Mengedit di TENGAH angka yang sudah panjang (jarang untuk field nominal)
 * akan ikut melompat ke akhir; trade-off yang diambil demi implementasi
 * yang sederhana & stabil di semua browser, tanpa library tambahan.
 */
export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onValueChange, prefix = "Rp", ...rest }, forwardedRef) => {
    const localRef = useRef<HTMLInputElement | null>(null);

    const setRefs = useCallback(
      (node: HTMLInputElement | null) => {
        localRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
      },
      [forwardedRef]
    );

    const digitsOnly = value.replace(/\D/g, "");
    const displayValue = digitsOnly === "" ? "" : Number(digitsOnly).toLocaleString("id-ID");

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const nextDigits = e.target.value.replace(/\D/g, "");
      onValueChange(nextDigits);
      requestAnimationFrame(() => {
        const el = localRef.current;
        if (el) {
          const end = el.value.length;
          el.setSelectionRange(end, end);
        }
      });
    };

    return (
      <Input
        ref={setRefs}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={displayValue}
        onChange={handleChange}
        leftIcon={prefix ? <span className="text-xs font-semibold">{prefix}</span> : undefined}
        {...rest}
      />
    );
  }
);

CurrencyInput.displayName = "CurrencyInput";
