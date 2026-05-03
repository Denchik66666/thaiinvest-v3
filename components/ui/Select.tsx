"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";

interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

interface SelectTriggerProps {
  className?: string;
  children: React.ReactNode;
}

interface SelectValueProps {
  placeholder?: string;
}

interface SelectContentProps {
  className?: string;
  children: React.ReactNode;
}

interface SelectItemProps {
  value: string;
  className?: string;
  children: React.ReactNode;
}

export function Select({ value, onValueChange, children, className }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className={cn("relative", className)}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<any>, {
            value,
            onValueChange,
            isOpen,
            setIsOpen,
          });
        }
        return child;
      })}
    </div>
  );
}

export function SelectTrigger({ className, children, ...props }: SelectTriggerProps & any) {
  return (
    <button
      type="button"
      className={cn(
        "w-full px-3 py-2 text-left bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500",
        className
      )}
      onClick={() => props.setIsOpen(!props.isOpen)}
    >
      {children}
    </button>
  );
}

export function SelectValue({ placeholder, ...props }: SelectValueProps & any) {
  return (
    <span>
      {props.value || <span className="text-slate-500">{placeholder}</span>}
    </span>
  );
}

export function SelectContent({ className, children, ...props }: SelectContentProps & any) {
  if (!props.isOpen) return null;
  
  return (
    <div className={cn(
      "absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg max-h-60 overflow-auto",
      className
    )}>
      {children}
    </div>
  );
}

export function SelectItem({ value, className, children, ...props }: SelectItemProps & any) {
  return (
    <button
      type="button"
      className={cn(
        "w-full px-3 py-2 text-left hover:bg-slate-700 focus:bg-slate-700 focus:outline-none",
        props.value === value && "bg-blue-600/20 text-blue-400",
        className
      )}
      onClick={() => {
        props.onValueChange?.(value);
        props.setIsOpen(false);
      }}
    >
      {children}
    </button>
  );
}
