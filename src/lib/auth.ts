export interface UserSession {
  id: string;
  display_name: string;
  is_guest: boolean;
  preferred_language: "id" | "en";
  preferred_theme: "dark_obsidian" | "light_sakura";
  telegram_chat_id?: string;
  email?: string;
}

/**
 * Generate a cryptographically random RFC4122 UUID v4
 */
function generateUUID(): string {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
    (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
  );
}

export const authService = {
  getCurrentUser(): UserSession | null {
    const raw = localStorage.getItem("ewallet_active_user");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  signInAsGuest(): UserSession {
    const defaultId = generateUUID();
    const guestUser: UserSession = {
      id: `guest_${defaultId}`,
      display_name: "Tamu Kita",
      is_guest: true,
      preferred_language: "id",
      preferred_theme: "dark_obsidian"
    };

    // Save to user registry
    const allUsers = this._getUsers();
    allUsers.push(guestUser);
    this._saveUsers(allUsers);

    localStorage.setItem("ewallet_active_user", JSON.stringify(guestUser));
    return guestUser;
  },

  signInWithGoogleMock(userEmail: string): UserSession {
    const allUsers = this._getUsers();
    // Look for existing google user
    let user = allUsers.find(u => u.email === userEmail);
    if (!user) {
      user = {
        id: generateUUID(),
        display_name: userEmail.split("@")[0].replace(/\W+/g, " "),
        is_guest: false,
        preferred_language: "id",
        preferred_theme: "dark_obsidian",
        email: userEmail
      };
      allUsers.push(user);
      this._saveUsers(allUsers);
    }

    localStorage.setItem("ewallet_active_user", JSON.stringify(user));
    return user;
  },

  signUpWithEmail(email: string, displayName: string, passwordSecret: string): UserSession | { error: string } {
    const cleanedEmail = email.toLowerCase().trim();
    const allUsers = this._getUsers();

    if (allUsers.some(u => u.email === cleanedEmail)) {
      return { error: "Email already registered! Try signing in instead." };
    }

    const newUser: UserSession = {
      id: generateUUID(),
      display_name: displayName.trim(),
      is_guest: false,
      preferred_language: "id",
      preferred_theme: "dark_obsidian",
      email: cleanedEmail
    };

    allUsers.push(newUser);
    this._saveUsers(allUsers);

    // Save password separately for secure local login mock
    localStorage.setItem(`pw_${newUser.id}`, passwordSecret);

    localStorage.setItem("ewallet_active_user", JSON.stringify(newUser));
    return newUser;
  },

  signInWithEmail(email: string, passwordSecret: string): UserSession | { error: string } {
    const cleanedEmail = email.toLowerCase().trim();
    const allUsers = this._getUsers();

    const matchedUser = allUsers.find(u => u.email === cleanedEmail);
    if (!matchedUser) {
      return { error: "No account registered with this email!" };
    }

    const savedPassword = localStorage.getItem(`pw_${matchedUser.id}`);
    if (savedPassword !== passwordSecret) {
      return { error: "Invalid password! Please double-check and try again." };
    }

    localStorage.setItem("ewallet_active_user", JSON.stringify(matchedUser));
    return matchedUser;
  },

  upgradeGuestToPermanent(guestId: string, email: string, displayName: string, passwordSecret: string): UserSession | { error: string } {
    const cleanedEmail = email.toLowerCase().trim();
    const allUsers = this._getUsers();

    if (allUsers.some(u => u.email === cleanedEmail && u.id !== guestId)) {
      return { error: "Email is already taken!" };
    }

    const idx = allUsers.findIndex(u => u.id === guestId);
    if (idx === -1) {
      return { error: "Guest session not found!" };
    }

    // Convert guest in-place to preserve account ID reference for existing transactions!
    const updatedUser = {
      ...allUsers[idx],
      display_name: displayName.trim(),
      email: cleanedEmail,
      is_guest: false
    };

    allUsers[idx] = updatedUser;
    this._saveUsers(allUsers);

    // Set credentials
    localStorage.setItem(`pw_${updatedUser.id}`, passwordSecret);

    // Save active session
    localStorage.setItem("ewallet_active_user", JSON.stringify(updatedUser));
    return updatedUser;
  },

  updateProfileName(userId: string, newName: string): UserSession {
    const active = this.getCurrentUser();
    if (active && active.id === userId) {
      active.display_name = newName;
      localStorage.setItem("ewallet_active_user", JSON.stringify(active));
    }

    const allUsers = this._getUsers();
    const idx = allUsers.findIndex(u => u.id === userId);
    if (idx !== -1) {
      allUsers[idx].display_name = newName;
      this._saveUsers(allUsers);
    }

    return active || { id: userId, display_name: newName, is_guest: false, preferred_language: "id", preferred_theme: "dark_obsidian" };
  },

  signOut(): void {
    localStorage.removeItem("ewallet_active_user");
  },

  // Helpers
  _getUsers(): UserSession[] {
    const raw = localStorage.getItem("ewallet_users");
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  },

  _saveUsers(users: UserSession[]): void {
    localStorage.setItem("ewallet_users", JSON.stringify(users));
  }
};
