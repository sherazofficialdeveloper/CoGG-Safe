import React from 'react';
import {StyleSheet, Text, TextInput, View} from 'react-native';
import Icon from './Icon';
import {colors, inputs, spacing, textStyle, typography} from '../theme';

export default function Input({label, error, required = false, leftIcon, rightIcon, style, ...props}) {
  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}{required ? ' *' : ''}</Text> : null}
      <View style={[styles.inputWrapper, error && styles.errorBorder, props.editable === false && styles.disabled]}>
        {leftIcon ? <Icon name={leftIcon} size={20} color={colors.mutedText} /> : null}
        <TextInput placeholderTextColor={colors.disabled} {...props} style={[styles.input, style]} />
        {rightIcon ? <Icon name={rightIcon} size={20} color={colors.mutedText} /> : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {marginBottom: spacing.md},
  label: textStyle({...typography.label, color: colors.mutedText, marginBottom: spacing.sm}),
  inputWrapper: {minHeight: inputs.height, borderWidth: 1, borderColor: colors.border, borderRadius: inputs.radius, backgroundColor: colors.surface, paddingHorizontal: inputs.paddingHorizontal, flexDirection: 'row', alignItems: 'center'},
  input: {...textStyle(typography.body), flex: 1, color: colors.text, paddingVertical: spacing.sm},
  errorBorder: {borderColor: colors.danger},
  disabled: {backgroundColor: '#F1F2F4'},
  error: textStyle({color: colors.danger, fontSize: 12, marginTop: spacing.xs}),
});
