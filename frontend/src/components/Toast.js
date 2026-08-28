import React, {useCallback, useEffect, useRef} from 'react';
import {
  Animated,
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';

const Toast = ({
  visible = false,
  message = '',
  type = 'success',
  duration = 3000,
  onHide,
}) => {
  const translateY = useRef(
    new Animated.Value(-100),
  ).current;

  const opacity = useRef(
    new Animated.Value(0),
  ).current;

  const hideToast = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (onHide) onHide();
    });
  }, [onHide, opacity, translateY]);

  useEffect(() => {
    if (!visible) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -100,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      return;
    }

    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      hideToast();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, hideToast, opacity, translateY, visible]);

  if (!visible) {
    return null;
  }

  const getTypeStyle = () => {
    switch (type) {
      case 'error':
        return {
          container: styles.errorContainer,
          icon: '!',
          iconContainer: styles.errorIcon,
        };

      case 'warning':
        return {
          container: styles.warningContainer,
          icon: '!',
          iconContainer: styles.warningIcon,
        };

      case 'info':
        return {
          container: styles.infoContainer,
          icon: 'i',
          iconContainer: styles.infoIcon,
        };

      default:
        return {
          container: styles.successContainer,
          icon: '✓',
          iconContainer: styles.successIcon,
        };
    }
  };

  const typeStyle = getTypeStyle();

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        {
          opacity,
          transform: [{translateY}],
        },
      ]}>
      <View
        style={[
          styles.toast,
          typeStyle.container,
        ]}>
        <View
          style={[
            styles.iconContainer,
            typeStyle.iconContainer,
          ]}>
          <Text style={styles.icon}>
            {typeStyle.icon}
          </Text>
        </View>

        <Text
          style={styles.message}
          numberOfLines={3}>
          {message}
        </Text>

        <TouchableOpacity
          style={styles.closeButton}
          activeOpacity={0.7}
          onPress={hideToast}>
          <Text style={styles.closeText}>
            ×
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 8,
    left: 15,
    right: 15,
    zIndex: 9999,
    elevation: 9999,
  },

  toast: {
    minHeight: 58,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',

    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 7,
  },

  successContainer: {
    backgroundColor: '#EAF9F0',
    borderWidth: 1,
    borderColor: '#BFE8D0',
  },

  errorContainer: {
    backgroundColor: '#FDE5E8',
    borderWidth: 1,
    borderColor: '#F5B9C2',
  },

  warningContainer: {
    backgroundColor: '#FFF4DF',
    borderWidth: 1,
    borderColor: '#F2D39A',
  },

  infoContainer: {
    backgroundColor: '#EAF3FF',
    borderWidth: 1,
    borderColor: '#BDD8F7',
  },

  iconContainer: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },

  successIcon: {
    backgroundColor: '#22A06B',
  },

  errorIcon: {
    backgroundColor: '#E4002B',
  },

  warningIcon: {
    backgroundColor: '#D88900',
  },

  infoIcon: {
    backgroundColor: '#2777D3',
  },

  icon: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },

  message: {
    flex: 1,
    color: '#2D2D31',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 15,
  },

  closeButton: {
    width: 27,
    height: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 5,
  },

  closeText: {
    color: '#77777D',
    fontSize: 20,
    fontWeight: '500',
  },
});

export default Toast;