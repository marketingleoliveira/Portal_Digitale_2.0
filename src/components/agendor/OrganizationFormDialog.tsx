import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSaveOrganization, type CrmOrganization } from "@/hooks/useAgendor";

interface OrganizationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization?: CrmOrganization | null;
}

const EMPTY = {
  name: "",
  legal_name: "",
  cnpj: "",
  sector: "",
  phone: "",
  email: "",
  website: "",
  city: "",
  state: "",
  notes: "",
};

export function OrganizationFormDialog({ open, onOpenChange, organization }: OrganizationFormDialogProps) {
  const saveOrganization = useSaveOrganization();
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (!open) return;
    setForm({
      name: organization?.name ?? "",
      legal_name: organization?.legal_name ?? "",
      cnpj: organization?.cnpj ?? "",
      sector: organization?.sector ?? "",
      phone: organization?.phone ?? "",
      email: organization?.email ?? "",
      website: organization?.website ?? "",
      city: organization?.city ?? "",
      state: organization?.state ?? "",
      notes: organization?.notes ?? "",
    });
  }, [open, organization]);

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    await saveOrganization.mutateAsync({
      id: organization?.id,
      name: form.name.trim(),
      legal_name: form.legal_name.trim() || null,
      cnpj: form.cnpj.trim() || null,
      sector: form.sector.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      website: form.website.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      notes: form.notes.trim() || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{organization ? "Editar organização" : "Nova organização"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">Nome *</Label>
            <Input id="org-name" value={form.name} onChange={set("name")} placeholder="Nome fantasia" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="org-legal">Razão social</Label>
              <Input id="org-legal" value={form.legal_name} onChange={set("legal_name")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-cnpj">CNPJ</Label>
              <Input id="org-cnpj" value={form.cnpj} onChange={set("cnpj")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-sector">Setor</Label>
              <Input id="org-sector" value={form.sector} onChange={set("sector")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-phone">Telefone</Label>
              <Input id="org-phone" value={form.phone} onChange={set("phone")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-email">E-mail</Label>
              <Input id="org-email" type="email" value={form.email} onChange={set("email")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-site">Site</Label>
              <Input id="org-site" value={form.website} onChange={set("website")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-city">Cidade</Label>
              <Input id="org-city" value={form.city} onChange={set("city")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-state">UF</Label>
              <Input id="org-state" value={form.state} onChange={set("state")} maxLength={2} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-notes">Observações</Label>
            <Textarea id="org-notes" value={form.notes} onChange={set("notes")} rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!form.name.trim() || saveOrganization.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
