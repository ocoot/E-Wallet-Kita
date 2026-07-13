/**
 * @deprecated Diganti oleh Context di `src/contexts/BalanceVisibilityContext.tsx`
 * supaya semua nominal di Dashboard berbagi SATU sumber state (lihat catatan
 * lengkap di file tersebut). File ini disisakan sebagai re-export tipis agar
 * import lama tidak patah -- konsumen baru sebaiknya import langsung dari
 * "../contexts/BalanceVisibilityContext".
 */
export { useBalanceVisibility, maskCurrency, maskCurrencyInText } from "../contexts/BalanceVisibilityContext";
