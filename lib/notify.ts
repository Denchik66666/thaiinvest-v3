/**
 * Единая точка для тостов (Sonner), стили задаются в `AppDialogsProvider`.
 *
 * Подтверждения (вместо `window.confirm`): `useAppDialogs().confirm({ title, ... })`.
 *
 * Глобальный toast при ошибке мутации: `MutationCache` в `app/providers.tsx`.
 * Чтобы не дублировать сообщение, у мутации укажите `meta: { skipErrorToast: true }`.
 */
export { toast, type ExternalToast } from "sonner";
