/**
 * Erro de regra de negócio: a mensagem é mostrada ao usuário como está.
 * Lance em services (`throw new DomainError("Estoque insuficiente.")`);
 * `runAction` converte em `{ ok: false, error }`. Qualquer outro erro vira "Erro inesperado".
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}
