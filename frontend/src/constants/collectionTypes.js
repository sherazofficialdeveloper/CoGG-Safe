export const COLLECTION_TYPES = Object.freeze([
  {value: 'personal', label: 'Personal'},
  {value: 'employees', label: 'Employees'},
  {value: 'other', label: 'Other'},
]);

export const COLLECTION_TYPE_VALUES = Object.freeze(
  COLLECTION_TYPES.map(type => type.value),
);

// Legacy backend values are mapped to the current UI labels so old groups
// continue to display correctly without showing "Family" or "Workers".
export const getCollectionTypeLabel = value => {
  if (value === 'family') return 'Personal';
  if (value === 'workers') return 'Employees';
  return COLLECTION_TYPES.find(type => type.value === value)?.label || value;
};
