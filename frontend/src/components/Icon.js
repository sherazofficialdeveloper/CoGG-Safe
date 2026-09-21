import React from 'react';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

export const iconNames = Object.freeze({
  back: 'arrow-left',
  edit: 'pencil-outline',
  delete: 'trash-can-outline',
  copy: 'content-copy',
  user: 'account-outline',
  collection: 'account-group-outline',
  family: 'account-multiple-outline',
  workers: 'briefcase-outline',
  other: 'dots-horizontal-circle-outline',
  dashboard: 'view-dashboard-outline',
  notifications: 'bell-outline',
  sos: 'alarm-light-outline',
  settings: 'cog-outline',
  logout: 'logout',
  add: 'plus',
  close: 'close',
  save: 'content-save-outline',
  search: 'magnify',
  eye: 'eye-outline',
  eyeOff: 'eye-off-outline',
});

export default function Icon({name, size = 20, color = '#1A1A1A', ...props}) {
  return <MaterialCommunityIcons name={iconNames[name] || name} size={size} color={color} {...props} />;
}
