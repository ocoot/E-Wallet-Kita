import React, { createContext, useContext, useState, useEffect } from "react";

type Theme = "dark_obsidian" | "light_sakura";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem("ewallet_theme") as Theme;
    if (saved === "dark_obsidian" || saved === "light_sakura") return saved;
    return "dark_obsidian"; // Default is Dark Obsidian as requested (or first listed)
  });

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem("ewallet_theme", newTheme);

    // Apply classes globally to handle body/html level styling
    const root = window.document.documentElement;
    root.classList.remove("dark_obsidian", "light_sakura");
    root.classList.add(newTheme);

    // Update live profile preferences in simulated user DB
    const activeUser = localStorage.getItem("ewallet_active_user");
    if (activeUser) {
      try {
        const parsed = JSON.parse(activeUser);
        parsed.preferred_theme = newTheme;
        localStorage.setItem("ewallet_active_user", JSON.stringify(parsed));
        
        // Also update in all users registration cache
        const allUsers = JSON.parse(localStorage.getItem("ewallet_users") || "[]");
        const idx = allUsers.findIndex((u: any) => u.id === parsed.id);
        if (idx !== -1) {
          allUsers[idx].preferred_theme = newTheme;
          localStorage.setItem("ewallet_users", JSON.stringify(allUsers));
        }
      } catch (err) {
        console.error("Error updates theme preferences cache:", err);
      }
    }
  };

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("dark_obsidian", "light_sakura");
    root.classList.add(theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
};
