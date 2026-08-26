import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrganizations, useSavePerson, type CrmPerson } from "@/hooks/useAgendor";

interface PersonFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person?: CrmPerson | null;
}

const NONE = "__none__";

export function PersonFormDialog({ open, onOpenChange, person }: PersonFormDialogProps) {
  const savePerson = useSavePerson();
  const { data: organizations = [] } = useOrganizations();
  const [form, setForm] = useState({
    name: "",
    job_title: "",
    email: "",
    phone: "",
    whatsapp: "",
    linkedin: "",
    organization_id: NONE,
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      name: person?.name ?? "",
      job_title: person?.job_title ?? "",
      email: person?.email ?? "",
      phone: person?.phone ?? "",
      whatsapp: person?.whatsapp ?? "",
      linkedin: person?.linkedin ?? "",
      organization_id: person?.organization_id ?? NONE,
    });
  }, [open, person]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    await savePerson.mutateAsync({
      id: person?.id,
      name: form.name.trim(),
      job_title: form.job_title.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      linkedin: form.linkedin.trim() || null,
      organization_id: form.organization_id === NONE ? null : form.organization_id,
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
          <DialogTitle>{person ? "Editar contato" : "Novo contato"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="person-name">Nome *</Label>
            <Input id="person-name" value={form.name} onChange={set("name")} />
          </div>
          <div className="space-y-2">
            <Label>Organização</Label>
            <Select
              value={form.organization_id}
              onValueChange={(v) => setForm((f) => ({ ...f, organization_id: v }))}
            >
              <SelectTrigger><SelectValue placeholder="Sem organização" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sem organização</SelectItem>
                {organizations.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="person-role">Cargo</Label>
              <Input id="person-role" value={form.job_title} onChange={set("job_title")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="person-email">E-mail</Label>
              <Input id="person-email" type="email" value={form.email} onChange={set("email")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="person-phone">Telefone</Label>
              <Input id="person-phone" value={form.phone} onChange={set("phone")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="person-whats">WhatsApp</Label>
              <Input id="person-whats" value={form.whatsapp} onChange={set("whatsapp")} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="person-linkedin">LinkedIn</Label>
            <Input id="person-linkedin" value={form.linkedin} onChange={set("linkedin")} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!form.name.trim() || savePerson.isPending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
