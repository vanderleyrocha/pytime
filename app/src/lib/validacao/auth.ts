import { z } from "zod";

export const esquemaLogin = z.object({
  email: z.string().email("E-mail inválido"),
  senha: z.string().min(8, "A senha deve ter pelo menos 8 caracteres"),
});

export const esquemaCadastro = esquemaLogin;

export const esquemaCriarEscola = z.object({
  nome: z.string().trim().min(2, "Informe o nome da escola"),
});

export const esquemaConvite = z.object({
  email: z.string().email("E-mail inválido"),
  papel: z.enum(["admin", "coordenador"], {
    message: "Papel deve ser admin ou coordenador",
  }),
});
