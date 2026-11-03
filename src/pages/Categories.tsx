import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { hasFullAccess } from '@/types/auth';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/local/client';
import { Category, Subcategory } from '@/types/auth';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Plus, Search, FolderOpen, Trash2, Loader2, FolderTree, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const Categories: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Dialog states
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [subcategoryDialogOpen, setSubcategoryDialogOpen] = useState(false);
  const [editCategoryDialogOpen, setEditCategoryDialogOpen] = useState(false);
  const [editSubcategoryDialogOpen, setEditSubcategoryDialogOpen] = useState(false);
  
  // Loading states
  const [savingCategory, setSavingCategory] = useState(false);
  const [savingSubcategory, setSavingSubcategory] = useState(false);
  const [updatingCategory, setUpdatingCategory] = useState(false);
  const [updatingSubcategory, setUpdatingSubcategory] = useState(false);

  // Form states
  const [newCategory, setNewCategory] = useState({
    name: '',
    description: '',
  });

  const [newSubcategory, setNewSubcategory] = useState({
    name: '',
    description: '',
    category_id: '',
  });

  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [editCategoryData, setEditCategoryData] = useState({
    name: '',
    description: '',
  });

  const [editSubcategory, setEditSubcategory] = useState<Subcategory | null>(null);
  const [editSubcategoryData, setEditSubcategoryData] = useState({
    name: '',
    description: '',
    category_id: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [categoriesRes, subcategoriesRes] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('subcategories').select('*').order('name'),
      ]);

      if (categoriesRes.error) throw categoriesRes.error;
      if (subcategoriesRes.error) throw subcategoriesRes.error;

      setCategories(categoriesRes.data || []);
      setSubcategories(subcategoriesRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategory.name.trim()) {
      toast({
        title: 'Erro',
        description: 'Nome da categoria é obrigatório',
        variant: 'destructive',
      });
      return;
    }

    setSavingCategory(true);

    try {
      const { error } = await supabase.from('categories').insert({
        name: newCategory.name.trim(),
        description: newCategory.description.trim() || null,
      });

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Categoria criada com sucesso',
      });

      setCategoryDialogOpen(false);
      setNewCategory({ name: '', description: '' });
      fetchData();
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao criar categoria',
        variant: 'destructive',
      });
    } finally {
      setSavingCategory(false);
    }
  };

  const handleCreateSubcategory = async () => {
    if (!newSubcategory.name.trim()) {
      toast({
        title: 'Erro',
        description: 'Nome da subcategoria é obrigatório',
        variant: 'destructive',
      });
      return;
    }

    if (!newSubcategory.category_id) {
      toast({
        title: 'Erro',
        description: 'Selecione uma categoria',
        variant: 'destructive',
      });
      return;
    }

    setSavingSubcategory(true);

    try {
      const { error } = await supabase.from('subcategories').insert({
        name: newSubcategory.name.trim(),
        description: newSubcategory.description.trim() || null,
        category_id: newSubcategory.category_id,
      });

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Subcategoria criada com sucesso',
      });

      setSubcategoryDialogOpen(false);
      setNewSubcategory({ name: '', description: '', category_id: '' });
      fetchData();
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao criar subcategoria',
        variant: 'destructive',
      });
    } finally {
      setSavingSubcategory(false);
    }
  };

  const openEditCategoryDialog = (cat: Category) => {
    setEditCategory(cat);
    setEditCategoryData({
      name: cat.name,
      description: cat.description || '',
    });
    setEditCategoryDialogOpen(true);
  };

  const openEditSubcategoryDialog = (sub: Subcategory) => {
    setEditSubcategory(sub);
    setEditSubcategoryData({
      name: sub.name,
      description: sub.description || '',
      category_id: sub.category_id,
    });
    setEditSubcategoryDialogOpen(true);
  };

  const handleUpdateCategory = async () => {
    if (!editCategory) return;

    if (!editCategoryData.name.trim()) {
      toast({
        title: 'Erro',
        description: 'Nome da categoria é obrigatório',
        variant: 'destructive',
      });
      return;
    }

    setUpdatingCategory(true);

    try {
      const oldCategoryName = editCategory.name;
      const newCategoryName = editCategoryData.name.trim();

      // Update the category
      const { error } = await supabase
        .from('categories')
        .update({
          name: newCategoryName,
          description: editCategoryData.description.trim() || null,
        })
        .eq('id', editCategory.id);

      if (error) throw error;

      // Update all files that use this category name
      if (oldCategoryName !== newCategoryName) {
        const { error: filesError } = await supabase
          .from('files')
          .update({ category: newCategoryName, updated_at: new Date().toISOString() })
          .eq('category', oldCategoryName);
        
        if (filesError) {
          console.error('Error updating files category:', filesError);
        }
      }

      toast({
        title: 'Sucesso',
        description: 'Categoria atualizada com sucesso',
      });

      setEditCategoryDialogOpen(false);
      setEditCategory(null);
      fetchData();
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao atualizar categoria',
        variant: 'destructive',
      });
    } finally {
      setUpdatingCategory(false);
    }
  };

  const handleUpdateSubcategory = async () => {
    if (!editSubcategory) return;

    if (!editSubcategoryData.name.trim()) {
      toast({
        title: 'Erro',
        description: 'Nome da subcategoria é obrigatório',
        variant: 'destructive',
      });
      return;
    }

    if (!editSubcategoryData.category_id) {
      toast({
        title: 'Erro',
        description: 'Selecione uma categoria',
        variant: 'destructive',
      });
      return;
    }

    setUpdatingSubcategory(true);

    try {
      const { error } = await supabase
        .from('subcategories')
        .update({
          name: editSubcategoryData.name.trim(),
          description: editSubcategoryData.description.trim() || null,
          category_id: editSubcategoryData.category_id,
        })
        .eq('id', editSubcategory.id);

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Subcategoria atualizada com sucesso',
      });

      setEditSubcategoryDialogOpen(false);
      setEditSubcategory(null);
      fetchData();
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao atualizar subcategoria',
        variant: 'destructive',
      });
    } finally {
      setUpdatingSubcategory(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    const hasSubcategories = subcategories.some(sub => sub.category_id === id);
    if (hasSubcategories) {
      toast({
        title: 'Erro',
        description: 'Exclua as subcategorias desta categoria antes de excluí-la',
        variant: 'destructive',
      });
      return;
    }

    if (!confirm('Tem certeza que deseja excluir esta categoria?')) return;

    try {
      const { error } = await supabase.from('categories').delete().eq('id', id);

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Categoria excluída',
      });

      fetchData();
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao excluir categoria',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteSubcategory = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta subcategoria?')) return;

    try {
      const { error } = await supabase.from('subcategories').delete().eq('id', id);

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Subcategoria excluída',
      });

      fetchData();
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao excluir subcategoria',
        variant: 'destructive',
      });
    }
  };

  const getSubcategoriesForCategory = (categoryId: string) => {
    return subcategories.filter(sub => sub.category_id === categoryId);
  };

  const filteredCategories = categories.filter((cat) =>
    cat.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Wait for user data to be fully loaded before checking permissions
  if (!user || user.role === null) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!hasFullAccess(user?.role)) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Você não tem permissão para acessar esta página</p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Categorias</h1>
            <p className="text-muted-foreground">Organize os materiais por categorias e subcategorias</p>
          </div>
          <div className="flex gap-2">
            {/* Subcategory Dialog */}
            <Dialog open={subcategoryDialogOpen} onOpenChange={setSubcategoryDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" disabled={categories.length === 0}>
                  <FolderTree className="w-4 h-4 mr-2" />
                  Nova Subcategoria
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Subcategoria</DialogTitle>
                  <DialogDescription>
                    Adicione uma nova subcategoria dentro de uma categoria existente
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="sub-category">Categoria *</Label>
                    <Select
                      value={newSubcategory.category_id}
                      onValueChange={(value) => setNewSubcategory({ ...newSubcategory, category_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sub-name">Nome *</Label>
                    <Input
                      id="sub-name"
                      value={newSubcategory.name}
                      onChange={(e) => setNewSubcategory({ ...newSubcategory, name: e.target.value })}
                      placeholder="Nome da subcategoria"
                      maxLength={100}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sub-description">Descrição</Label>
                    <Textarea
                      id="sub-description"
                      value={newSubcategory.description}
                      onChange={(e) => setNewSubcategory({ ...newSubcategory, description: e.target.value })}
                      placeholder="Descrição opcional"
                      maxLength={500}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setSubcategoryDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreateSubcategory} disabled={savingSubcategory}>
                    {savingSubcategory ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Criando...
                      </>
                    ) : (
                      'Criar'
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Category Dialog */}
            <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
              <DialogTrigger asChild>
                <Button className="shadow-primary">
                  <Plus className="w-4 h-4 mr-2" />
                  Nova Categoria
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Categoria</DialogTitle>
                  <DialogDescription>
                    Adicione uma nova categoria para organizar os materiais
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome *</Label>
                    <Input
                      id="name"
                      value={newCategory.name}
                      onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                      placeholder="Nome da categoria"
                      maxLength={100}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Descrição</Label>
                    <Textarea
                      id="description"
                      value={newCategory.description}
                      onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
                      placeholder="Descrição opcional"
                      maxLength={500}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreateCategory} disabled={savingCategory}>
                    {savingCategory ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Criando...
                      </>
                    ) : (
                      'Criar'
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar categorias..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Categories with Subcategories */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : filteredCategories.length === 0 ? (
              <div className="text-center py-12">
                <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">Nenhuma categoria encontrada</p>
              </div>
            ) : (
              <Accordion type="multiple" className="w-full">
                {filteredCategories.map((cat) => {
                  const catSubcategories = getSubcategoriesForCategory(cat.id);
                  return (
                    <AccordionItem key={cat.id} value={cat.id}>
                      <AccordionTrigger className="px-4 hover:no-underline">
                        <div className="flex items-center gap-3 flex-1">
                          <FolderOpen className="w-5 h-5 text-primary" />
                          <span className="font-medium">{cat.name}</span>
                          {catSubcategories.length > 0 && (
                            <Badge variant="secondary" className="ml-2">
                              {catSubcategories.length} subcategoria{catSubcategories.length > 1 ? 's' : ''}
                            </Badge>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4">
                        <div className="space-y-4">
                          {cat.description && (
                            <p className="text-sm text-muted-foreground pl-8">{cat.description}</p>
                          )}
                          <div className="flex items-center justify-between pl-8">
                            <span className="text-xs text-muted-foreground">
                              Criada em: {new Date(cat.created_at).toLocaleDateString('pt-BR')}
                            </span>
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditCategoryDialog(cat)}
                              >
                                <Pencil className="w-4 h-4 mr-1" />
                                Editar
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteCategory(cat.id)}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="w-4 h-4 mr-1" />
                                Excluir
                              </Button>
                            </div>
                          </div>

                          {catSubcategories.length > 0 && (
                            <div className="mt-4 pl-8">
                              <h4 className="text-sm font-medium mb-2">Subcategorias:</h4>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Nome</TableHead>
                                    <TableHead>Descrição</TableHead>
                                    <TableHead>Criada em</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {catSubcategories.map((sub) => (
                                    <TableRow key={sub.id}>
                                      <TableCell>
                                        <div className="flex items-center gap-2">
                                          <FolderTree className="w-4 h-4 text-muted-foreground" />
                                          <span>{sub.name}</span>
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-muted-foreground">
                                        {sub.description || '-'}
                                      </TableCell>
                                      <TableCell>
                                        {new Date(sub.created_at).toLocaleDateString('pt-BR')}
                                      </TableCell>
                                      <TableCell className="text-right">
                                        <div className="flex justify-end gap-1">
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => openEditSubcategoryDialog(sub)}
                                          >
                                            <Pencil className="w-4 h-4" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleDeleteSubcategory(sub.id)}
                                          >
                                            <Trash2 className="w-4 h-4 text-destructive" />
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}

                          {catSubcategories.length === 0 && (
                            <p className="text-sm text-muted-foreground pl-8 italic">
                              Nenhuma subcategoria nesta categoria
                            </p>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </CardContent>
        </Card>

        {/* Edit Category Dialog */}
        <Dialog open={editCategoryDialogOpen} onOpenChange={setEditCategoryDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Categoria</DialogTitle>
              <DialogDescription>
                Altere as informações da categoria
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-cat-name">Nome *</Label>
                <Input
                  id="edit-cat-name"
                  value={editCategoryData.name}
                  onChange={(e) => setEditCategoryData({ ...editCategoryData, name: e.target.value })}
                  placeholder="Nome da categoria"
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-cat-description">Descrição</Label>
                <Textarea
                  id="edit-cat-description"
                  value={editCategoryData.description}
                  onChange={(e) => setEditCategoryData({ ...editCategoryData, description: e.target.value })}
                  placeholder="Descrição opcional"
                  maxLength={500}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditCategoryDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleUpdateCategory} disabled={updatingCategory}>
                {updatingCategory ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Subcategory Dialog */}
        <Dialog open={editSubcategoryDialogOpen} onOpenChange={setEditSubcategoryDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Subcategoria</DialogTitle>
              <DialogDescription>
                Altere as informações da subcategoria
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-sub-category">Categoria *</Label>
                <Select
                  value={editSubcategoryData.category_id}
                  onValueChange={(value) => setEditSubcategoryData({ ...editSubcategoryData, category_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-sub-name">Nome *</Label>
                <Input
                  id="edit-sub-name"
                  value={editSubcategoryData.name}
                  onChange={(e) => setEditSubcategoryData({ ...editSubcategoryData, name: e.target.value })}
                  placeholder="Nome da subcategoria"
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-sub-description">Descrição</Label>
                <Textarea
                  id="edit-sub-description"
                  value={editSubcategoryData.description}
                  onChange={(e) => setEditSubcategoryData({ ...editSubcategoryData, description: e.target.value })}
                  placeholder="Descrição opcional"
                  maxLength={500}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditSubcategoryDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleUpdateSubcategory} disabled={updatingSubcategory}>
                {updatingSubcategory ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Categories;