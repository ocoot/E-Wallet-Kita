// This hook used to fetch categories independently every time it was
// called (8 call sites — see CategoriesContext.tsx for details), causing
// duplicate network requests for data that's shared and rarely changes.
// It now simply re-exports the shared CategoriesProvider context so every
// existing call site (`const { categories } = useCategories()`) keeps
// working unchanged, but all of them now read from one cached fetch.
export { useCategoriesContext as useCategories } from "../contexts/CategoriesContext";
