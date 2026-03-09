import { useState } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Building2, 
  ClipboardList, 
  Users, 
  Plus, 
  Pencil, 
  Trash2,
  QrCode,
  MapPin,
  Settings
} from "lucide-react";
import { departments } from "@/types/department";
import { checklistTemplates } from "@/data/checklistData";

// Mock data for demonstration
const mockStations = [
  { id: "1", name: "Sala de Compressores", department: "manutencao", qrCode: "COMP-001" },
  { id: "2", name: "Armazém 2", department: "logistica", qrCode: "ARM-002" },
  { id: "3", name: "Linha de Produção A", department: "qualidade", qrCode: "PROD-A01" },
  { id: "4", name: "Entrada Principal", department: "seguranca", qrCode: "ENT-001" },
];

const mockUsers = [
  { id: "1", name: "João Silva", email: "joao@carbo.com", role: "operator", department: "manutencao" },
  { id: "2", name: "Maria Santos", email: "maria@carbo.com", role: "supervisor", department: "logistica" },
  { id: "3", name: "Carlos Oliveira", email: "carlos@carbo.com", role: "admin", department: null },
];

const Admin = () => {
  const [activeTab, setActiveTab] = useState("departments");

  return (
    <BoardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-board-text">Painel Administrativo</h1>
            <p className="text-board-muted">Gerencie departamentos, checklists e usuários</p>
          </div>
          <Button className="gap-2">
            <Settings className="h-4 w-4" />
            Configurações
          </Button>
        </div>

        {/* Tabs */}
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
            </TabsTrigger>
          </TabsList>

          {/* Departments Tab */}
          <TabsContent value="departments" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Departamentos</h2>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Novo Departamento
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {departments.map((dept) => (
                <Card key={dept.id} className="relative overflow-hidden">
                  <div className={`absolute inset-x-0 top-0 h-1 bg-${dept.color}`} />
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <span className="text-3xl">{dept.icon}</span>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <CardTitle className="text-lg">{dept.name}</CardTitle>
                    <CardDescription>{dept.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      <Badge variant="secondary">
                        {mockStations.filter(s => s.department === dept.id).length} estações
                      </Badge>
                      <Badge variant="outline">
                        {mockUsers.filter(u => u.department === dept.id).length} usuários
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Stations Tab */}
          <TabsContent value="stations" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Estações QR Code</h2>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Nova Estação
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium">Estação</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Departamento</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Código QR</th>
                      <th className="px-4 py-3 text-right text-sm font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {mockStations.map((station) => {
                      const dept = departments.find(d => d.id === station.department);
                      return (
                        <tr key={station.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{station.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {dept && (
                              <Badge variant="outline" className="gap-1">
                                {dept.icon} {dept.name}
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <code className="rounded bg-muted px-2 py-1 text-sm">
                              {station.qrCode}
                            </code>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <QrCode className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
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
          </TabsContent>

          {/* Checklists Tab */}
          <TabsContent value="checklists" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Templates de Checklist</h2>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Novo Template
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {checklistTemplates.map((template) => (
                <Card key={template.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl">{template.icon}</span>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <CardTitle className="text-base">{template.name}</CardTitle>
                    <CardDescription className="text-xs">
                      {template.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Seções</span>
                        <span className="font-medium">{template.sections.length}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Itens totais</span>
                        <span className="font-medium">
                          {template.sections.reduce((acc, s) => acc + s.items.length, 0)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Usuários</h2>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Novo Usuário
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium">Usuário</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Papel</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Departamento</th>
                      <th className="px-4 py-3 text-right text-sm font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {mockUsers.map((user) => {
                      const dept = departments.find(d => d.id === user.department);
                      return (
                        <tr key={user.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium">{user.name}</p>
                              <p className="text-sm text-muted-foreground">{user.email}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge 
                              variant={user.role === "admin" ? "default" : "secondary"}
                            >
                              {user.role === "admin" && "Administrador"}
                              {user.role === "supervisor" && "Supervisor"}
                              {user.role === "operator" && "Operador"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            {dept ? (
                              <Badge variant="outline" className="gap-1">
                                {dept.icon} {dept.name}
                              </Badge>
                            ) : (
                              <span className="text-sm text-muted-foreground">Todos</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
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
          </TabsContent>
        </Tabs>
      </div>
    </BoardLayout>
  );
};

export default Admin;
