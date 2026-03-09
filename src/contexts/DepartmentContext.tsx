import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { DepartmentId, Department, departments, getDepartmentById } from "@/types/department";

interface DepartmentContextType {
  currentDepartment: Department | null;
  setDepartment: (id: DepartmentId) => void;
  clearDepartment: () => void;
  departments: Department[];
}

const DepartmentContext = createContext<DepartmentContextType | undefined>(undefined);

export function DepartmentProvider({ children }: { children: ReactNode }) {
  const [currentDepartment, setCurrentDepartment] = useState<Department | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("carbo-department");
    if (saved) {
      const dept = getDepartmentById(saved as DepartmentId);
      if (dept) setCurrentDepartment(dept);
    }
  }, []);

  // Apply department color tint to body
  useEffect(() => {
    const root = document.documentElement;
    // Remove all department classes
    departments.forEach(d => {
      root.classList.remove(`dept-${d.id}`);
    });
    // Add current department class
    if (currentDepartment) {
      root.classList.add(`dept-${currentDepartment.id}`);
    }
  }, [currentDepartment]);

  const setDepartment = (id: DepartmentId) => {
    const dept = getDepartmentById(id);
    if (dept) {
      setCurrentDepartment(dept);
      localStorage.setItem("carbo-department", id);
    }
  };

  const clearDepartment = () => {
    setCurrentDepartment(null);
    localStorage.removeItem("carbo-department");
  };

  return (
    <DepartmentContext.Provider
      value={{
        currentDepartment,
        setDepartment,
        clearDepartment,
        departments,
      }}
    >
      {children}
    </DepartmentContext.Provider>
  );
}

export function useDepartment() {
  const context = useContext(DepartmentContext);
  if (context === undefined) {
    throw new Error("useDepartment must be used within a DepartmentProvider");
  }
  return context;
}
