export const COLLECTION_TYPES = Object.freeze([
  {value: 'family', label: 'Family'},
  {value: 'workers', label: 'Workers'},
  {value: 'other', label: 'Other'},
]);

export const COLLECTION_TYPE_VALUES = Object.freeze(
  COLLECTION_TYPES.map(type => type.value),
);

export const getCollectionTypeLabel = value =>
  COLLECTION_TYPES.find(type => type.value === value)?.label || value;
