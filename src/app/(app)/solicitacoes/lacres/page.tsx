import { redirect } from "next/navigation";

/** S19: lacre é só da franquia e fica na aba Franquias. Quem chegar pelo endereço antigo vai para lá. */
export default function LacresPage() {
  redirect("/franquias/lacres");
}
