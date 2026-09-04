import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, FlatList, SafeAreaView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {getCachedApiData, listSos} from '../api/resources';

const UserHistoryScreen = ({token, onBack, onHistoryDetail}) => {
  const [records, setRecords] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    const cached = getCachedApiData('/sos', token);
    if (cached?.sos) {
      setRecords(cached.sos);
      setLoading(false);
    }
    listSos(token)
      .then(result => mounted && setRecords(result.sos || []))
      .catch(requestError => mounted && setError(requestError.message))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [token]);
  const filtered = useMemo(() => filter === 'all' ? records : records.filter(item => item.status === filter), [filter, records]);
  const renderItem = ({item}) => <TouchableOpacity style={styles.card} onPress={() => onHistoryDetail?.(item)}><View style={styles.mark}><Text style={styles.markText}>!</Text></View><View style={styles.body}><Text style={styles.date}>{item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Date unavailable'}</Text><Text style={styles.location}>{item.location?.latitude != null ? `${item.location.latitude}, ${item.location.longitude}` : 'Location unavailable'}</Text><Text style={styles.status}>{item.status}</Text></View><Text style={styles.arrow}>›</Text></TouchableOpacity>;
  return <SafeAreaView style={styles.safe}><View style={styles.header}><TouchableOpacity onPress={onBack}><Text style={styles.back}>‹</Text></TouchableOpacity><View><Text style={styles.title}>SOS History</Text><Text style={styles.subtitle}>{records.length} records</Text></View></View><View style={styles.filters}>{['all', 'cancelled', 'deactivated'].map(value => <TouchableOpacity key={value} style={[styles.filter, filter === value && styles.activeFilter]} onPress={() => setFilter(value)}><Text style={filter === value ? styles.activeFilterText : styles.filterText}>{value}</Text></TouchableOpacity>)}</View>{loading ? <View style={styles.state}><ActivityIndicator color="#E4002B" /><Text style={styles.text}>Loading history...</Text></View> : error ? <View style={styles.state}><Text style={styles.stateTitle}>Unable to load history</Text><Text style={styles.text}>{error}</Text></View> : <FlatList data={filtered} renderItem={renderItem} keyExtractor={item => item._id} contentContainerStyle={styles.list} ListEmptyComponent={<View style={styles.state}><Text style={styles.stateTitle}>No SOS records</Text><Text style={styles.text}>Your completed emergency records will appear here.</Text></View>} />}</SafeAreaView>;
};
const styles = StyleSheet.create({safe: {flex: 1, backgroundColor: '#F7F7F8'}, header: {backgroundColor: '#FFF', padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: 1, borderBottomColor: '#E8E8EB'}, back: {fontSize: 36}, title: {fontSize: 21, fontWeight: '900', color: '#1A1A1A'}, subtitle: {fontSize: 11, color: '#A1A1A6', marginTop: 4}, filters: {flexDirection: 'row', padding: 16, gap: 8}, filter: {paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, backgroundColor: '#FFF'}, activeFilter: {backgroundColor: '#E4002B'}, filterText: {color: '#59636E', textTransform: 'capitalize'}, activeFilterText: {color: '#FFF', textTransform: 'capitalize', fontWeight: '800'}, list: {padding: 16}, card: {backgroundColor: '#FFF', padding: 15, borderRadius: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ECECEF'}, mark: {width: 38, height: 38, borderRadius: 19, backgroundColor: '#FDE5E8', alignItems: 'center', justifyContent: 'center'}, markText: {color: '#E4002B', fontWeight: '900', fontSize: 19}, body: {flex: 1, marginHorizontal: 12}, date: {fontWeight: '800', color: '#1A1A1A'}, location: {color: '#59636E', marginTop: 5}, status: {color: '#E4002B', marginTop: 5, textTransform: 'capitalize'}, arrow: {fontSize: 26, color: '#A1A1A6'}, state: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24}, stateTitle: {fontSize: 17, fontWeight: '800', color: '#1A1A1A'}, text: {color: '#59636E', textAlign: 'center', marginTop: 8}});
export default UserHistoryScreen;
