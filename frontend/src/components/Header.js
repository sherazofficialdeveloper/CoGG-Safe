import React from 'react';
import {StatusBar, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from './Icon';
import {colors, spacing, textStyle, typography} from '../theme';

export default function Header({title, subtitle, onBack, navigation, right, backgroundColor = colors.surface}) {
  const insets = useSafeAreaInsets();
  const handleBack = () => {
    if (onBack) return onBack();
    if (navigation?.canGoBack?.()) return navigation.goBack();
  };
  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={backgroundColor} translucent={false} />
      <View style={[styles.header, {paddingTop: insets.top + spacing.sm, backgroundColor}]}>
        <TouchableOpacity onPress={handleBack} disabled={!onBack && !navigation} style={styles.action} accessibilityLabel="Go back">
          <Icon name="back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.center}>
          <Text numberOfLines={1} style={styles.title}>{title}</Text>
          {subtitle ? <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <View style={styles.right}>{right || null}</View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  header: {minHeight: 74, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border},
  action: {width: 42, height: 42, alignItems: 'flex-start', justifyContent: 'center'},
  center: {flex: 1, alignItems: 'center', paddingHorizontal: spacing.sm},
  title: textStyle({...typography.h3, color: colors.text}),
  subtitle: textStyle({...typography.caption, color: colors.mutedText, marginTop: 2}),
  right: {width: 72, alignItems: 'flex-end'},
});
