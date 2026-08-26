import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { PersonFormDialog } from "./PersonFormDialog";
import { useDeletePerson, useOrganizations, usePeople, type CrmPerson } from "@/hooks/useAgendor";

export function PeoplePanel() {
  const { data: people = [], isLoading } = usePeople();
  const { data: organizations = [] } = useOrganizations();
  const deletePerson = useDeletePerson();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CrmPerson | null>(null);
  const [toDelete, setToDelete] = useState<CrmPerson | null>(null);

  const orgName = (id: string | null) =>
    organizations.find((o) => o.id === id)?.name ?? "—";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) =>
      [p.name, p.email, p.phone, p.job_title]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q))
    );
  }, [people, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar contatos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          className="gap-2"
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
        >
          <Plus className="w-4 h-4" />
          Novo contato
        </Button>
      </div>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="hidden md:table-cell">Organização</TableHead>
              <TableHead className="hidden md:table-cell">Cargo</TableHead>
              <TableHead className="hidden lg:table-cell">E-mail</TableHead>
              <TableHead className="hidden lg:table-cell">Telefone</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Carregando...</TableCell></TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Nenhum contato cadastrado.</TableCell></TableRow>
            )}
            {filtered.map((person) => (
              <TableRow key={person.id}>
                <TableCell className="font-medium">{person.name}</TableCell>
                <TableCell className="hidden md:table-cell text-sm">{orgName(person.organization_id)}</TableCell>
                <TableCell className="hidden md:table-cell text-sm">{person.job_title ?? "—"}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm">{person.email ?? "—"}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm">{person.phone ?? person.whatsapp ?? "—"}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar ${person.name}`}
                    onClick={() => {
                      setEditing(person);
                      setShowForm(true);
                    }}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Excluir ${person.name}`}
                    onClick={() => setToDelete(person)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <PersonFormDialog open={showForm} onOpenChange={setShowForm} person={editing} />

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contato?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (toDelete) deletePerson.mutate(toDelete.id);
                setToDelete(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
