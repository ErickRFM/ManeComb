import { create } from "zustand";

const useAuthStore = create((set) => ({
  user: null,
  token: null,

  login: (data) =>
    set({
      user: data.user,
      token: data.token
    }),

  logout: () =>
    set({
      user: null,
      token: null
    })
}));

export default useAuthStore;