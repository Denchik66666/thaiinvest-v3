import { z } from "zod";

/**
 * Схема создания инвестора
 */
export const CreateInvestorSchema = z.object({
  name: z.string().min(2, "Имя слишком короткое"),
  handle: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  body: z.coerce.number().positive("Тело должно быть положительным"),
  /** Игнорируется при создании в общей сети (ставка = бизнес-ставка на дату входа). Для совместимости с клиентом остаётся опциональным. */
  rate: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().min(0, "Ставка не может быть отрицательной").optional()
  ),
  entryDate: z.string().or(z.date()),
  isPrivate: z.boolean().default(false),
});

export type CreateInvestorInput = z.infer<typeof CreateInvestorSchema>;

/**
 * Схема создания выплаты
 */
export const CreatePaymentSchema = z.object({
  investorId: z.number().int(),
  type: z.enum(["interest", "body", "close"]),
  amount: z.coerce.number().positive("Сумма должна быть положительной").optional(),
});

export type CreatePaymentInput = z.infer<typeof CreatePaymentSchema>;

/**
 * Схема авторизации
 */
export const LoginSchema = z.object({
  username: z.string().trim().min(1, "Введите логин"),
  password: z.string().min(1, "Введите пароль"),
});

export type LoginInput = z.infer<typeof LoginSchema>;
