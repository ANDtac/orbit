/**
 * Re-exports the SchemaForm renderer and its validation helper so they can be
 * consumed from the shared UI component tree.  The implementation lives at
 * the feature level; this barrel keeps the public import path stable.
 */
export {
  SchemaForm,
  validateSchemaForm,
  type SchemaFormProps,
} from "@/features/automation/components/SchemaForm";
