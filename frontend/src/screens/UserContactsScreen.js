// UserContactsScreen.js
import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import {listContacts} from '../api/resources';
import Icon from '../components/Icon';

const UserContactsScreen = ({token, onBack}) => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');

    listContacts(token)
      .then(result => {
        if (!mounted) return;
        setContacts(result.contacts || []);
      })
      .catch(requestError => {
        if (!mounted) return;
        setError(requestError.message || 'Unable to load contacts.');
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => { mounted = false; };
  }, [token]);

  const totalContactCount = contacts.length;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}>

      <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.8}>
        <Text style={styles.backIcon}>←</Text>
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderContent}>
          <Text style={styles.sectionLabel}>CONTACTS</Text>
          <Text style={styles.sectionTitle}>Your collection members</Text>
          <Text style={styles.sectionDescription}>
            Users assigned to your collection can be reached here.
          </Text>
        </View>

        <View style={styles.contactCountBadge}>
          <Text style={styles.contactCountText}>{loading ? '-' : totalContactCount}</Text>
          <Text style={styles.contactCountLabel}>TOTAL</Text>
        </View>
      </View>

      <View style={styles.contactsContainer}>
        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color="#E4002B" />
            <Text style={styles.stateText}>Loading collection members...</Text>
          </View>
        ) : error ? (
          <View style={styles.stateCard}>
            <Text style={styles.emptyText}>{error}</Text>
          </View>
        ) : totalContactCount === 0 ? (
          <View style={styles.stateCard}>
            <Text style={styles.emptyText}>No other users are assigned to your collection.</Text>
          </View>
        ) : contacts.map((contact, index) => (
          <TouchableOpacity key={contact._id} style={styles.contactCard} activeOpacity={0.82}>
            <View style={[styles.cardAccent, index === 0 && styles.primaryCardAccent]} />

            <View style={[styles.contactAvatar, {backgroundColor: '#F3F4F6'}]}>
              <Text style={styles.contactAvatarText}>
                {(contact.username || 'C').slice(0, 2).toUpperCase()}
              </Text>
            </View>

            <View style={styles.contactInfo}>
              <View style={styles.contactNameRow}>
                <Text style={styles.contactName} numberOfLines={1}>
                  {contact.username || contact.name || 'Collection member'}
                </Text>
              </View>
              <Text style={styles.contactRelation}>{contact.email || 'No email on file'}</Text>
              <View style={styles.phoneRow}>
                <Icon name="phone" size={16} color="#6B7280" />
                <Text style={styles.contactPhone}>{contact.mobileNumber || 'No phone number'}</Text>
              </View>
            </View>

            <View style={styles.contactRight}>
              <View style={[styles.statusBadge, contact.status !== 'active' && styles.inactiveBadge]}>
                <View style={[styles.statusDot, contact.status !== 'active' && styles.inactiveDot]} />
                <Text style={[styles.statusBadgeText, contact.status !== 'active' && styles.inactiveBadgeText]}>
                  {contact.status === 'active' ? 'ACTIVE' : 'INACTIVE'}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {totalContactCount > 0 ? <View style={styles.bottomInfoCard}>
        <View style={styles.bottomInfoIconContainer}>
          <Text style={styles.bottomInfoIcon}>✓</Text>
        </View>
        <View style={styles.bottomInfoContent}>
          <Text style={styles.bottomInfoTitle}>Your collection is ready</Text>
          <Text style={styles.bottomInfoDescription}>
            These users share the same collection access and contact record.
          </Text>
        </View>
        <View style={styles.readyBadge}>
          <Text style={styles.readyBadgeText}>READY</Text>
        </View>
      </View> : null}

      <View style={styles.footer}>
        <View style={styles.footerLine} />
        <Text style={styles.footerText}>
          Keep your collection members up to date for better safety.
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 26,
  },

  /* ================= BACK BUTTON ================= */
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 22,
    backgroundColor: '#FFF0F2',
    borderWidth: 1,
    borderColor: '#FFD5DA',
    marginBottom: 16,
  },

  backIcon: {
    fontSize: 16,
    color: '#E4002B',
    fontWeight: '600',
    marginRight: 6,
  },

  backText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E4002B',
    letterSpacing: 0.3,
  },

  /* ================= SECTION HEADER ================= */
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },

  sectionHeaderContent: {
    flex: 1,
    paddingRight: 12,
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#9CA3AF',
    letterSpacing: 1.7,
    marginBottom: 6,
  },

  sectionTitle: {
    fontSize: 25,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 7,
  },

  sectionDescription: {
    fontSize: 13,
    lineHeight: 20,
    color: '#6B7280',
    fontWeight: '600',
  },

  contactCountBadge: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#FFF0F2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFDDE2',
  },

  contactCountText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#E4002B',
    lineHeight: 22,
  },

  contactCountLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: '#E4002B',
    letterSpacing: 0.8,
    marginTop: 1,
  },

  /* ================= CONTACTS ================= */
  contactsContainer: {
    gap: 12,
  },

  stateCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  stateText: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
    textAlign: 'center',
  },

  emptyText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
    textAlign: 'center',
  },

  contactCard: {
    minHeight: 118,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E3E6EA',
    borderRadius: 22,
    padding: 16,
    paddingLeft: 20,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },

  cardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
    backgroundColor: '#E5E7EB',
  },

  primaryCardAccent: {
    backgroundColor: '#E4002B',
  },

  contactAvatar: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },

  contactAvatarText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  contactInfo: {
    flex: 1,
    minWidth: 0,
    paddingRight: 6,
  },

  contactNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  contactName: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
  },

  primaryBadge: {
    marginLeft: 6,
    backgroundColor: '#FFF0F2',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
  },

  primaryBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#E4002B',
    letterSpacing: 0.7,
  },

  contactRelation: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    marginTop: 4,
  },

  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 7,
  },

  phoneIcon: {
    fontSize: 13,
    color: '#9CA3AF',
    marginRight: 5,
  },

  contactPhone: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4B5563',
  },

  contactRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginLeft: 4,
  },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF3',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
  },

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
    marginRight: 5,
  },

  statusBadgeText: {
    color: '#16A34A',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.7,
  },

  inactiveBadge: {
    backgroundColor: '#F3F4F6',
  },

  inactiveDot: {
    backgroundColor: '#9CA3AF',
  },

  inactiveBadgeText: {
    color: '#6B7280',
  },

  chevron: {
    fontSize: 27,
    color: '#B0B5BE',
    fontWeight: '300',
    lineHeight: 28,
  },

  bottomInfoCard: {
    marginTop: 22,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E4E8ED',
    borderRadius: 22,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },

  bottomInfoIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#ECFDF3',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },

  bottomInfoIcon: {
    fontSize: 24,
    fontWeight: '900',
    color: '#16A34A',
  },

  bottomInfoContent: {
    flex: 1,
    paddingRight: 8,
  },

  bottomInfoTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111827',
  },

  bottomInfoDescription: {
    fontSize: 11,
    lineHeight: 17,
    color: '#6B7280',
    fontWeight: '600',
    marginTop: 4,
  },

  readyBadge: {
    backgroundColor: '#ECFDF3',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },

  readyBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#16A34A',
    letterSpacing: 0.8,
  },

  footer: {
    alignItems: 'center',
    marginTop: 24,
    paddingHorizontal: 20,
  },

  footerLine: {
    width: 45,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    marginBottom: 12,
  },

  footerText: {
    fontSize: 11,
    lineHeight: 17,
    color: '#8B919B',
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default UserContactsScreen;