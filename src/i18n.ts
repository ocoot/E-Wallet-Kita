import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    resources: {
      en: {
        translation: {
          'login.title': 'Welcome to E-Wallet Kita',
          'login.google': 'Sign in with Google',
          'login.guest': 'Continue as Guest',
          'categories.food_drink': 'Food & Drink',
          'categories.salary': 'Salary',
          'categories.other': 'Other',
        },
      },
      id: {
        translation: {
          'login.title': 'Selamat Datang di E-Wallet Kita',
          'login.google': 'Masuk dengan Google',
          'login.guest': 'Lanjut sebagai Tamu',
          'categories.food_drink': 'Makanan & Minuman',
          'categories.salary': 'Gaji',
          'categories.other': 'Lain-lain',
        },
      },
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
