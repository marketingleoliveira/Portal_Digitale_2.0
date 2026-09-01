import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  formatBRL,
  useDealProducts,
  useDeleteDealProduct,
  useSaveDealProduct,
} from "@/hooks/useAgendor";

interface DealProductsPanelProps {
  dealId: string;
}

/** Produtos do negócio, usando o catálogo real do ERP (tabela products). */
export function DealProductsPanel({ dealId }: DealProductsPanelProps) {
  const { data: items = [] } = useDealProducts(dealId);
  const saveProduct = useSaveDealProduct();
  const deleteProduct = useDeleteDealProduct();
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [adding, setAdding] = useState(false);

  const { data: catalog = [] } = useQuery({
    queryKey: ["crm-catalog-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const total = items.reduce(
    (acc, i) => acc + Number(i.quantity) * Number(i.unit_price) - Number(i.discount ?? 0),
    0
  );

  const handleAdd = async () => {
    const product = catalog.find((p) => p.id === productId);
    if (!product) return;
    await saveProduct.mutateAsync({
      deal_id: dealId,
      product_id: product.id,
      product_name: product.name,
      quantity: Number(quantity.replace(",", ".")) || 1,
      unit_price: Number(product.price ?? 0),
    });
    setProductId("");
    setQuantity("1");
    setAdding(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Produtos</h4>
        <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setAdding((v) => !v)}>
          <Plus className="w-4 h-4" />
          Adicionar
        </Button>
      </div>

      {adding && (
        <div className="space-y-2 rounded-md border p-3">
          <div className="space-y-1.5">
            <Label>Produto do catálogo</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {catalog.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.price ? ` — ${formatBRL(Number(p.price))}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qty">Quantidade</Label>
            <Input id="qty" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <Button size="sm" onClick={handleAdd} disabled={!productId || saveProduct.isPending}>
            Vincular produto
          </Button>
        </div>
      )}

      {items.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">Nenhum produto vinculado a este negócio.</p>
      )}

      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2 text-sm py-1.5 border-b last:border-b-0">
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">{item.product_name}</p>
            <p className="text-xs text-muted-foreground">
              {Number(item.quantity)} × {formatBRL(Number(item.unit_price))}
            </p>
          </div>
          <span className="font-semibold shrink-0">
            {formatBRL(Number(item.quantity) * Number(item.unit_price) - Number(item.discount ?? 0))}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remover ${item.product_name}`}
            onClick={() => deleteProduct.mutate(item.id)}
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      ))}

      {items.length > 0 && (
        <p className="text-sm font-semibold text-right">Total: {formatBRL(total)}</p>
      )}
    </div>
  );
}
