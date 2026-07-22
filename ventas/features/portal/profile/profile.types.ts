export type ProfileSection = 'resumen' | 'empresa' | 'seguridad' | 'soporte';

export type ProfileForm = {
  name: string;
  email: string;
  phone: string;
  companyName: string;
  legalName: string;
  taxId: string;
  billingEmail: string;
  billingAddress: string;
};
