export type AuthMode = 'login' | 'register';

export type AuthIdentity = {
  email: string;
  phone?: string;
  displayName: string;
};
