export interface FormGroupProps {
  children: React.ReactNode;
}

export function FormGroup({ children }: FormGroupProps) {
  return <div className="space-y-2">{children}</div>;
}