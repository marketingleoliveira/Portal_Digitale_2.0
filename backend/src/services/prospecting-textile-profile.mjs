
export function classifyTextileBuyer(text) {
  const s = String(text || "");

  const fabricante =
    /confec[cç][aã]o|fabricante\s+de\s+(?:roupas?|vestu[aá]rio|uniformes?)|f[aá]brica\s+de\s+roupas?|private\s+label|fac[cç][aã]o|produ[cç][aã]o\s+pr[oó]pria|ind[uú]stria\s+de\s+confec[cç][oõ]es/i.test(s);

  const vestuario =
    /moda\s+(?:fitness|feminina|masculina|praia|esportiva|[ií]ntima)|activewear|sportswear|vestu[aá]rio|roupas?|leggings?|biqu[ií]nis?|mai[oô]s|lingerie|uniformes?|malharia|jeans|vestidos?|camisetas?|cal[cç]as?/i.test(s);

  const tecidos =
    /(?:atacado|distribui[cç][aã]o|revenda)\s+de\s+tecidos|tecidos\s+para\s+confec[cç][aã]o/i.test(s);

  if (tecidos) return "comprador_tecidos";
  if (fabricante && vestuario) return "confeccao";

  return null;
}
