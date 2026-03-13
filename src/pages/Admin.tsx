import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Building2,
  ClipboardList,
  Users,
  Plus,
  Pencil,
  Trash2,
  QrCode,
  MapPin,
  Settings,
  Loader2,
  ExternalLink,
} from "lucide-react";
import {
  useDepartments,
  useCreateDepartment,
  useUpdateDepartment,
  useDeleteDepartment,
  useStations,
  useCreateStation,
  useUpdateStation,
  useDeleteStation,
  useChecklistTemplates,
  useUpdateChecklistTemplate,
  useDeleteChecklistTemplate,
  DbDepartment,
  DbStation,
  DbChecklistTemplate,
} from "@/hooks/useAdminData";

// ============================================================
// Department Dialog
// ============================================================
function DepartmentDialog({
  open,
  onOpenChange,
  department,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  department?: DbDepartment | null;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("📋");
  const [color, setColor] = useState("#3B82F6");
  const [displayOrder, setDisplayOrder] = useState(0);

  const createMutation = useCreateDepartment();
  const updateMutation = useUpdateDepartment();
  const isEditing = !!department;

  useEffect(() => {
    if (department) {
      setName(department.name);
      setDescription(department.description || "");
      setIcon(department.icon);
      setColor(department.color);
      setDisplayOrder(department.display_order);
    } else {
      setName("");
      setDescription("");
      setIcon("📋");
      setColor("#3B82F6");
      setDisplayOrder(0);
    }
  }, [department, open]);

  const handleSubmit = async () => {
    const payload = { name, description, icon, color, display_order: displayOrder };
    if (isEditing) {
      await updateMutation.mutateAsync({ id: department.id, ...payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    onOpenChange(false);
  };

  const loading = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Departamento" : "Novo Departamento"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Atualize as informações do departamento." : "Preencha os dados do novo departamento."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-3 space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Produção" />
            </div>
            <div className="space-y-2">
              <Label>Ícone</Label>
              <Input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="📋" className="text-center text-xl" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição do departamento" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex gap-2">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 cursor-pointer rounded border" />
                <Input value={color} onChange={(e) => setColor(e.target.value)} className="flex-1" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Ordem</Label>
              <Input type="number" value={displayOrder} onChange={(e) => setDisplayOrder(Number(e.target.value))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading || !name}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Station Dialog
// ============================================================
function StationDialog({
  open,
  onOpenChange,
  station,
  departments,
  templates,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  station?: DbStation | null;
  departments: DbDepartment[];
  templates: DbChecklistTemplate[];
}) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [departmentType, setDepartmentType] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [checklistTemplateId, setChecklistTemplateId] = useState("");
  const [sensorId, setSensorId] = useState("");

  const createMutation = useCreateStation();
  const updateMutation = useUpdateStation();
  const isEditing = !!station;

  useEffect(() => {
    if (station) {
      setName(station.name);
      setLocation(station.location || "");
      setDepartmentType(station.department_type);
      setQrCode(station.qr_code);
      setChecklistTemplateId(station.checklist_template_id || "");
      setSensorId(station.sensor_id || "");
    } else {
      setName("");
      setLocation("");
      setDepartmentType("");
      setQrCode("");
      setChecklistTemplateId("");
      setSensorId("");
    }
  }, [station, open]);

  const handleSubmit = async () => {
    const payload: any = {
      name,
      location: location || null,
      department_type: departmentType,
      qr_code: qrCode,
      checklist_template_id: checklistTemplateId || null,
      sensor_id: sensorId || null,
    };
    if (isEditing) {
      await updateMutation.mutateAsync({ id: station.id, ...payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    onOpenChange(false);
  };

  const loading = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Estação" : "Nova Estação"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Atualize as informações da estação." : "Configure uma nova estação com QR Code."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome da Estação</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Sala de Compressores" />
          </div>
          <div className="space-y-2">
            <Label>Localização</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex: Bloco A - Térreo" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Departamento</Label>
              <Select value={departmentType} onValueChange={setDepartmentType}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.type}>{d.icon} {d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Código QR</Label>
              <Input value={qrCode} onChange={(e) => setQrCode(e.target.value.toUpperCase())} placeholder="Ex: COMP-001" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Template de Checklist (opcional)</Label>
            <Select value={checklistTemplateId} onValueChange={setChecklistTemplateId}>
              <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Sensor ID (opcional)</Label>
            <Input value={sensorId} onChange={(e) => setSensorId(e.target.value)} placeholder="IoT sensor ID" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading || !name || !departmentType || !qrCode}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Checklist Template Dialog
// ============================================================
function ChecklistDialog({
  open,
  onOpenChange,
  template,
  departments,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  template?: DbChecklistTemplate | null;
  departments: DbDepartment[];
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState("");
  const [isActive, setIsActive] = useState(true);

  const updateMutation = useUpdateChecklistTemplate();

  useEffect(() => {
    if (template) {
      setName(template.name);
      setDescription(template.description || "");
      setDepartment(template.department);
      setIsActive(template.is_active);
    }
  }, [template, open]);

  const handleSubmit = async () => {
    if (!template) return;
    await updateMutation.mutateAsync({
      id: template.id,
      name,
      description,
      department,
      is_active: isActive,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Template</DialogTitle>
          <DialogDescription>Atualize as informações do template de checklist.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Departamento</Label>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.type}>{d.icon} {d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border"
            />
            <Label>Ativo</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={updateMutation.isPending || !name}>
            {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Delete Confirmation
// ============================================================
function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={loading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ============================================================
// Main Admin Page
// ============================================================
const Admin = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("departments");

  const { data: departments = [], isLoading: loadingDepts } = useDepartments();
  const { data: stations = [], isLoading: loadingStations } = useStations();
  const { data: templates = [], isLoading: loadingTemplates } = useChecklistTemplates();

  const [deptDialogOpen, setDeptDialogOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<DbDepartment | null>(null);
  const [stationDialogOpen, setStationDialogOpen] = useState(false);
  const [editingStation, setEditingStation] = useState<DbStation | null>(null);
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<DbChecklistTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: string; id: string; name: string } | null>(null);

  const deleteDept = useDeleteDepartment();
  const deleteStation = useDeleteStation();
  const deleteTemplate = useDeleteChecklistTemplate();

  useEffect(() => {
    if (activeTab === "users") {
      navigate("/team");
    }
  }, [activeTab, navigate]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "department") await deleteDept.mutateAsync(deleteTarget.id);
    if (deleteTarget.type === "station") await deleteStation.mutateAsync(deleteTarget.id);
    if (deleteTarget.type === "template") await deleteTemplate.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  };

  const getDeptByType = (type: string) => departments.find((d) => d.type === type);

  return (
    <BoardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-board-text">Painel Administrativo</h1>
            <p className="text-board-muted">Gerencie departamentos, estações e checklists</p>
          </div>
          <Button className="gap-2">
            <Settings className="h-4 w-4" />
            Configurações
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-lg grid-cols-4">
            <TabsTrigger value="departments" className="gap-2">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Departamentos</span>
            </TabsTrigger>
            <TabsTrigger value="stations" className="gap-2">
              <QrCode className="h-4 w-4" />
              <span className="hidden sm:inline">Estações</span>
            </TabsTrigger>
            <TabsTrigger value="checklists" className="gap-2">
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">Checklists</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Usuários</span>
              <ExternalLink className="h-3 w-3" />
            </TabsTrigger>
          </TabsList>

          {/* Departments */}
          <TabsContent value="departments" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Departamentos</h2>
              <Button size="sm" className="gap-2" onClick={() => { setEditingDept(null); setDeptDialogOpen(true); }}>
                <Plus className="h-4 w-4" /> Novo Departamento
              </Button>
            </div>
            {loadingDepts ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : departments.length === 0 ? (
              <Card className="py-12 text-center"><CardContent><p className="text-muted-foreground">Nenhum departamento cadastrado.</p></CardContent></Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {departments.map((dept) => (
                  <Card key={dept.id} className="relative overflow-hidden">
                    <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: dept.color }} />
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <span className="text-3xl">{dept.icon}</span>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingDept(dept); setDeptDialogOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget({ type: "department", id: dept.id, name: dept.name })}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <CardTitle className="text-lg">{dept.name}</CardTitle>
                      <CardDescription>{dept.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-2">
                        <Badge variant="secondary">{stations.filter((s) => s.department_type === dept.type).length} estações</Badge>
                        {!dept.is_active && <Badge variant="destructive">Inativo</Badge>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Stations */}
          <TabsContent value="stations" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Estações QR Code</h2>
              <Button size="sm" className="gap-2" onClick={() => { setEditingStation(null); setStationDialogOpen(true); }}>
                <Plus className="h-4 w-4" /> Nova Estação
              </Button>
            </div>
            {loadingStations ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : stations.length === 0 ? (
              <Card className="py-12 text-center"><CardContent><p className="text-muted-foreground">Nenhuma estação cadastrada.</p></CardContent></Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <table className="w-full">
                    <thead className="border-b bg-muted/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium">Estação</th>
                        <th className="px-4 py-3 text-left text-sm font-medium">Departamento</th>
                        <th className="px-4 py-3 text-left text-sm font-medium">Código QR</th>
                        <th className="px-4 py-3 text-left text-sm font-medium">Localização</th>
                        <th className="px-4 py-3 text-right text-sm font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {stations.map((station) => {
                        const dept = getDeptByType(station.department_type);
                        return (
                          <tr key={station.id} className="hover:bg-muted/30">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">{station.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {dept && <Badge variant="outline" className="gap-1">{dept.icon} {dept.name}</Badge>}
                            </td>
                            <td className="px-4 py-3">
                              <code className="rounded bg-muted px-2 py-1 text-sm">{station.qr_code}</code>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{station.location || "—"}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingStation(station); setStationDialogOpen(true); }}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget({ type: "station", id: station.id, name: station.name })}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Checklists */}
          <TabsContent value="checklists" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Templates de Checklist</h2>
            </div>
            {loadingTemplates ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : templates.length === 0 ? (
              <Card className="py-12 text-center"><CardContent><p className="text-muted-foreground">Nenhum template cadastrado.</p></CardContent></Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {templates.map((template) => {
                  const dept = getDeptByType(template.department);
                  const itemCount = Array.isArray(template.items) ? template.items.length : 0;
                  return (
                    <Card key={template.id} className={!template.is_active ? "opacity-60" : ""}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {dept && <span className="text-xl">{dept.icon}</span>}
                            {!template.is_active && <Badge variant="destructive" className="text-xs">Inativo</Badge>}
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingTemplate(template); setChecklistDialogOpen(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget({ type: "template", id: template.id, name: template.name })}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <CardTitle className="text-base">{template.name}</CardTitle>
                        <CardDescription className="text-xs">{template.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Departamento</span>
                            <span className="font-medium">{dept?.name || template.department}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Itens</span>
                            <span className="font-medium">{itemCount}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Versão</span>
                            <span className="font-medium">v{template.version}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="users" />
        </Tabs>
      </div>

      <DepartmentDialog open={deptDialogOpen} onOpenChange={setDeptDialogOpen} department={editingDept} />
      <StationDialog open={stationDialogOpen} onOpenChange={setStationDialogOpen} station={editingStation} departments={departments} templates={templates} />
      <ChecklistDialog open={checklistDialogOpen} onOpenChange={setChecklistDialogOpen} template={editingTemplate} departments={departments} />
      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Excluir ${deleteTarget?.type === "department" ? "departamento" : deleteTarget?.type === "station" ? "estação" : "template"}?`}
        description={`Tem certeza que deseja excluir "${deleteTarget?.name}"? Esta ação não pode ser desfeita.`}
        onConfirm={handleDelete}
        loading={deleteDept.isPending || deleteStation.isPending || deleteTemplate.isPending}
      />
    </BoardLayout>
  );
};

export default Admin;
