/**
 * Consulta CEP via ViaCEP (https://viacep.com.br)
 */
export interface ViaCepResponse {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

export interface AddressFromCep {
  address: string;
  city: string;
  state: string;
}

export async function fetchAddressByCep(
  cep: string
): Promise<AddressFromCep | null> {
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) return null;

  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    const data: ViaCepResponse = await res.json();
    if (data.erro) return null;

    const parts = [data.logradouro, data.bairro].filter(Boolean);
    const address = parts.join(", ") || "";

    return {
      address,
      city: data.localidade || "",
      state: data.uf || "",
    };
  } catch {
    return null;
  }
}
