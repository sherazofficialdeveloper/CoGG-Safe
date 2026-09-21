import {Platform} from 'react-native';

export const colors = Object.freeze({
  primary: '#E4002B',
  secondary: '#1A1A1A',
  background: '#F6F7F9',
  surface: '#FFFFFF',
  text: '#1A1A1A',
  mutedText: '#6B7280',
  border: '#E1E5EA',
  success: '#178A4B',
  warning: '#B7791F',
  danger: '#B42318',
  disabled: '#A1A1A6',
});

export const typography = Object.freeze({
  fontFamily: Platform.select({ios: 'System', android: 'sans-serif'}),
  fontWeight: Object.freeze({regular: '400', medium: '600', semibold: '700', bold: '800', heavy: '900'}),
  display: {fontSize: 30, fontWeight: '900'},
  h1: {fontSize: 24, fontWeight: '900'},
  h2: {fontSize: 20, fontWeight: '900'},
  h3: {fontSize: 16, fontWeight: '800'},
  body: {fontSize: 15, fontWeight: '400'},
  bodySmall: {fontSize: 13, fontWeight: '400'},
  label: {fontSize: 12, fontWeight: '800'},
  caption: {fontSize: 12, fontWeight: '600'},
  button: {fontSize: 15, fontWeight: '800'},
  buttonSmall: {fontSize: 13, fontWeight: '800'},
});

export const spacing = Object.freeze({xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 36});
export const radii = Object.freeze({small: 8, medium: 12, large: 16, pill: 999});
export const buttons = Object.freeze({height: 50, paddingHorizontal: 16, radius: radii.medium, iconSize: 20});
export const inputs = Object.freeze({height: 52, radius: radii.medium, paddingHorizontal: 14});
export const cards = Object.freeze({radius: radii.large, padding: spacing.lg, borderWidth: 1});

export const textStyle = style => ({fontFamily: typography.fontFamily, ...style});
