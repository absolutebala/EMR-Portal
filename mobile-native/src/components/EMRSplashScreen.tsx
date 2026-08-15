import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  SafeAreaView,
} from 'react-native';

const { width, height } = Dimensions.get('window');

interface EMRSplashScreenProps {
  onFinish?: () => void;
}

export const EMRSplashScreen: React.FC<EMRSplashScreenProps> = ({ onFinish }) => {
  // Animation Controller Values
  const gridOpacity = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.96)).current;
  const accentLineWidth = useRef(new Animated.Value(0)).current;
  const accentLineOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslateY = useRef(new Animated.Value(8)).current;
  const subtextOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Stage-by-Stage Timed Animation Sequence
    Animated.sequence([
      // Stage 1: Grid Reveal (0.0s -> 0.25s)
      Animated.timing(gridOpacity, {
        toValue: 0.15,
        duration: 250,
        useNativeDriver: true,
      }),
      // Stage 2: Logo Assembly & Subtle Scale (0.25s -> 0.7s)
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 450,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 1,
          duration: 450,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          useNativeDriver: true,
        }),
      ]),
      // Stage 3: Red Accent Signal Sweep (0.55s -> 0.9s)
      Animated.parallel([
        Animated.timing(accentLineOpacity, {
          toValue: 0.6,
          duration: 200,
          // Must match accentLineWidth's useNativeDriver setting below — they're
          // both applied to the same Animated.View, and mixing a native-driven and
          // JS-driven prop on one component crashes ("...animated node that has
          // been moved to native earlier...").
          useNativeDriver: false,
        }),
        Animated.timing(accentLineWidth, {
          toValue: width * 0.4,
          duration: 350,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false, // Layout property
        }),
      ]),
      // Stage 4: Brand Text Fade-in (0.85s -> 1.25s)
      Animated.parallel([
        Animated.timing(accentLineOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false, // must match accentLineWidth (same Animated.View)
        }),
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(textTranslateY, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(subtextOpacity, {
          toValue: 1,
          duration: 400,
          delay: 150,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      // Stage 5: Completion hold then trigger app entry
      setTimeout(() => {
        if (onFinish) onFinish();
      }, 450);
    });
    // Runs once on mount — the Animated.Value refs are stable (useRef) and this
    // sequence is intentionally never re-triggered by a parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      {/* Background Radial Gradient Effect */}
      <View style={styles.backgroundGlow} />

      {/* Grid Overlay */}
      <Animated.View style={[styles.gridContainer, { opacity: gridOpacity }]}>
        <View style={styles.gridLineHorizontal} />
        <View style={styles.gridLineVertical} />
        <View style={styles.crosshairTL} />
        <View style={styles.crosshairBR} />
      </Animated.View>

      {/* Main Safe Area Content */}
      <View style={styles.contentContainer}>
        {/* EMR Logo Container */}
        <Animated.View
          style={[
            styles.logoWrapper,
            {
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <Image
            source={require('../../assets/images/emr-logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Red Accent Pulse Line */}
        <Animated.View
          style={[
            styles.accentLine,
            {
              width: accentLineWidth,
              opacity: accentLineOpacity,
            },
          ]}
        />

        {/* Enterprise Brand Lockup */}
        <Animated.View
          style={[
            styles.textContainer,
            {
              opacity: textOpacity,
              transform: [{ translateY: textTranslateY }],
            },
          ]}
        >
          <Text style={styles.titleText}>EMR Service</Text>
          <Animated.Text style={[styles.subtitleText, { opacity: subtextOpacity }]}>
            FIELD SERVICE MANAGEMENT
          </Animated.Text>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121418',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backgroundGlow: {
    position: 'absolute',
    width: width * 1.2,
    height: width * 1.2,
    borderRadius: (width * 1.2) / 2,
    backgroundColor: '#1E232D',
    opacity: 0.25,
  },
  gridContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridLineHorizontal: {
    position: 'absolute',
    width: '100%',
    height: 1,
    backgroundColor: '#3B4254',
  },
  gridLineVertical: {
    position: 'absolute',
    width: 1,
    height: '100%',
    backgroundColor: '#3B4254',
  },
  crosshairTL: {
    position: 'absolute',
    top: height * 0.25,
    left: width * 0.15,
    width: 8,
    height: 8,
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: '#3B4254',
  },
  crosshairBR: {
    position: 'absolute',
    bottom: height * 0.25,
    right: width * 0.15,
    width: 8,
    height: 8,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#3B4254',
  },
  contentContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '80%',
  },
  logoWrapper: {
    width: 240,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  accentLine: {
    height: 1,
    backgroundColor: '#C81E2B',
    marginTop: 12,
    marginBottom: 16,
  },
  textContainer: {
    alignItems: 'center',
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  subtitleText: {
    color: '#8A909A',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2.5,
  },
});
