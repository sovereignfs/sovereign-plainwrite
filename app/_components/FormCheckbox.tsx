'use client';

import { useState } from 'react';
import { Checkbox, type CheckboxProps } from '@sovereignfs/ui';

interface FormCheckboxProps extends Omit<CheckboxProps, 'checked' | 'onChange'> {
  defaultChecked?: boolean;
}

/**
 * DS Checkbox is a controlled component (checked/onChange), but native
 * <form action={serverAction}> submission — used throughout this plugin's
 * server-rendered pages — needs an uncontrolled defaultChecked entry point.
 * This bridges the two: local state seeded once from defaultChecked: the
 * underlying <input> still has a real name/value and participates in native
 * form submission like any other field.
 */
export function FormCheckbox({ defaultChecked = false, ...rest }: FormCheckboxProps) {
  const [checked, setChecked] = useState(defaultChecked);
  return <Checkbox {...rest} checked={checked} onChange={setChecked} />;
}
