/**
 * Bundled offline prayer-location city list (R1, solution-design §4.3).
 *
 * Every Bangladesh district town plus major diaspora cities with
 * meaningful Bangladeshi/Muslim communities — name + Bangla name +
 * raw coordinates. This is what makes AC1.1.2's "complete setup entirely
 * offline by naming a place" real: pure coordinate entry is hostile to
 * the app's least technical users, and the bn names are the persona-4
 * investment pattern the catalog already embodies.
 *
 * Compact tuple rows keep the bundled payload small (~2–3KB gzipped);
 * the exported array is the shaped {id, name, nameBn, lat, lng} dataset.
 * `tz` is deliberately NOT stored: the device clock is the truth
 * (§4.4 traveler rule), so a city needs no timezone bookkeeping.
 *
 * Coordinates are the district HQ / city centre at ~2-decimal precision
 * (≈1km) — far finer than any prayer-time method's sensitivity.
 * bn names are transliterations in common Bangladeshi usage.
 */

export interface PrayerCity {
  id: string;
  name: string;
  nameBn: string;
  lat: number;
  lng: number;
}

type Row = readonly [id: string, name: string, nameBn: string, lat: number, lng: number];

const ROWS: readonly Row[] = [
  // ----- Bangladesh — Dhaka division -----
  ['bd-dhaka', 'Dhaka', 'ঢাকা', 23.81, 90.41],
  ['bd-faridpur', 'Faridpur', 'ফরিদপুর', 23.61, 89.83],
  ['bd-gazipur', 'Gazipur', 'গাজীপুর', 23.99, 90.42],
  ['bd-gopalganj', 'Gopalganj', 'গোপালগঞ্জ', 23.01, 89.83],
  ['bd-kishoreganj', 'Kishoreganj', 'কিশোরগঞ্জ', 24.43, 90.78],
  ['bd-madaripur', 'Madaripur', 'মাদারীপুর', 23.16, 90.19],
  ['bd-manikganj', 'Manikganj', 'মানিকগঞ্জ', 23.86, 90.0],
  ['bd-munshiganj', 'Munshiganj', 'মুন্সিগঞ্জ', 23.55, 90.53],
  ['bd-narayanganj', 'Narayanganj', 'নারায়ণগঞ্জ', 23.62, 90.5],
  ['bd-narsingdi', 'Narsingdi', 'নরসিংদী', 23.92, 90.72],
  ['bd-rajbari', 'Rajbari', 'রাজবাড়ী', 23.76, 89.64],
  ['bd-shariatpur', 'Shariatpur', 'শরীয়তপুর', 23.21, 90.35],
  ['bd-tangail', 'Tangail', 'টাঙ্গাইল', 24.25, 89.92],
  // ----- Bangladesh — Chattogram division -----
  ['bd-bandarban', 'Bandarban', 'বান্দরবান', 22.2, 92.22],
  ['bd-brahmanbaria', 'Brahmanbaria', 'ব্রাহ্মণবাড়িয়া', 23.96, 91.11],
  ['bd-chandpur', 'Chandpur', 'চাঁদপুর', 23.23, 90.67],
  ['bd-chattogram', 'Chattogram', 'চট্টগ্রাম', 22.36, 91.78],
  ['bd-cumilla', 'Cumilla', 'কুমিল্লা', 23.46, 91.18],
  ['bd-coxsbazar', "Cox's Bazar", 'কক্সবাজার', 21.44, 92.0],
  ['bd-feni', 'Feni', 'ফেনী', 23.02, 91.4],
  ['bd-khagrachhari', 'Khagrachhari', 'খাগড়াছড়ি', 23.12, 91.98],
  ['bd-lakshmipur', 'Lakshmipur', 'লক্ষ্মীপুর', 22.94, 90.83],
  ['bd-noakhali', 'Noakhali', 'নোয়াখালী', 22.87, 91.1],
  ['bd-rangamati', 'Rangamati', 'রাঙ্গামাটি', 22.65, 92.17],
  // ----- Bangladesh — Sylhet division -----
  ['bd-habiganj', 'Habiganj', 'হবিগঞ্জ', 24.37, 91.42],
  ['bd-moulvibazar', 'Moulvibazar', 'মৌলভীবাজার', 24.48, 91.78],
  ['bd-sunamganj', 'Sunamganj', 'সুনামগঞ্জ', 25.07, 91.4],
  ['bd-sylhet', 'Sylhet', 'সিলেট', 24.9, 91.87],
  // ----- Bangladesh — Barishal division -----
  ['bd-barguna', 'Barguna', 'বরগুনা', 22.16, 90.13],
  ['bd-barishal', 'Barishal', 'বরিশাল', 22.7, 90.37],
  ['bd-bhola', 'Bhola', 'ভোলা', 22.69, 90.64],
  ['bd-jhalokati', 'Jhalokati', 'ঝালকাঠি', 22.64, 90.2],
  ['bd-patuakhali', 'Patuakhali', 'পটুয়াখালী', 22.36, 90.33],
  ['bd-pirojpur', 'Pirojpur', 'পিরোজপুর', 22.58, 89.97],
  // ----- Bangladesh — Khulna division -----
  ['bd-bagerhat', 'Bagerhat', 'বাগেরহাট', 22.65, 89.79],
  ['bd-chuadanga', 'Chuadanga', 'চুয়াডাঙ্গা', 23.64, 88.85],
  ['bd-jashore', 'Jashore', 'যশোর', 23.17, 89.21],
  ['bd-jhenaidah', 'Jhenaidah', 'ঝিনাইদহ', 23.54, 89.17],
  ['bd-khulna', 'Khulna', 'খুলনা', 22.81, 89.56],
  ['bd-kushtia', 'Kushtia', 'কুষ্টিয়া', 23.9, 89.12],
  ['bd-magura', 'Magura', 'মাগুরা', 23.49, 89.34],
  ['bd-meherpur', 'Meherpur', 'মেহেরপুর', 23.77, 88.63],
  ['bd-narail', 'Narail', 'নড়াইল', 23.17, 89.5],
  ['bd-satkhira', 'Satkhira', 'সাতক্ষীরা', 22.72, 89.07],
  // ----- Bangladesh — Rajshahi division -----
  ['bd-bogura', 'Bogura', 'বগুড়া', 24.85, 89.37],
  ['bd-chapainawabganj', 'Chapainawabganj', 'চাঁপাইনবাবগঞ্জ', 24.6, 88.28],
  ['bd-joypurhat', 'Joypurhat', 'জয়পুরহাট', 25.1, 89.02],
  ['bd-naogaon', 'Naogaon', 'নওগাঁ', 24.8, 88.93],
  ['bd-natore', 'Natore', 'নাটোর', 24.42, 89.0],
  ['bd-pabna', 'Pabna', 'পাবনা', 24.0, 89.24],
  ['bd-rajshahi', 'Rajshahi', 'রাজশাহী', 24.37, 88.6],
  ['bd-sirajganj', 'Sirajganj', 'সিরাজগঞ্জ', 24.45, 89.7],
  // ----- Bangladesh — Rangpur division -----
  ['bd-dinajpur', 'Dinajpur', 'দিনাজপুর', 25.63, 88.64],
  ['bd-gaibandha', 'Gaibandha', 'গাইবান্ধা', 25.33, 89.55],
  ['bd-kurigram', 'Kurigram', 'কুড়িগ্রাম', 25.81, 89.65],
  ['bd-lalmonirhat', 'Lalmonirhat', 'লালমনিরহাট', 25.92, 89.45],
  ['bd-nilphamari', 'Nilphamari', 'নীলফামারী', 25.93, 88.86],
  ['bd-panchagarh', 'Panchagarh', 'পঞ্চগড়', 26.34, 88.56],
  ['bd-rangpur', 'Rangpur', 'রংপুর', 25.75, 89.25],
  ['bd-thakurgaon', 'Thakurgaon', 'ঠাকুরগাঁও', 26.03, 88.47],
  // ----- Bangladesh — Mymensingh division -----
  ['bd-jamalpur', 'Jamalpur', 'জামালপুর', 24.92, 89.94],
  ['bd-mymensingh', 'Mymensingh', 'ময়মনসিংহ', 24.75, 90.4],
  ['bd-netrokona', 'Netrokona', 'নেত্রকোণা', 24.88, 90.73],
  ['bd-sherpur', 'Sherpur', 'শেরপুর', 25.02, 90.02],

  // ----- United Kingdom -----
  ['gb-london', 'London', 'লন্ডন', 51.51, -0.13],
  ['gb-birmingham', 'Birmingham', 'বার্মিংহাম', 52.49, -1.89],
  ['gb-manchester', 'Manchester', 'ম্যানচেস্টার', 53.48, -2.24],
  ['gb-bradford', 'Bradford', 'ব্র্যাডফোর্ড', 53.8, -1.75],
  ['gb-leeds', 'Leeds', 'লিডস', 53.8, -1.55],
  ['gb-leicester', 'Leicester', 'লেস্টার', 52.64, -1.14],
  ['gb-sheffield', 'Sheffield', 'শেফিল্ড', 53.38, -1.47],
  ['gb-liverpool', 'Liverpool', 'লিভারপুল', 53.41, -2.98],
  ['gb-bristol', 'Bristol', 'ব্রিস্টল', 51.45, -2.59],
  ['gb-glasgow', 'Glasgow', 'গ্লাসগো', 55.86, -4.25],
  ['gb-edinburgh', 'Edinburgh', 'এডিনবারা', 55.95, -3.19],
  ['gb-aberdeen', 'Aberdeen', 'অ্যাবারডিন', 57.15, -2.09],
  ['gb-cardiff', 'Cardiff', 'কার্ডিফ', 51.48, -3.18],
  ['gb-luton', 'Luton', 'লুটন', 51.88, -0.42],
  ['gb-oldham', 'Oldham', 'ওল্ডহ্যাম', 53.54, -2.11],
  ['gb-rochdale', 'Rochdale', 'রচডেল', 53.61, -2.16],
  ['gb-bolton', 'Bolton', 'বোল্টন', 53.58, -2.43],
  ['gb-preston', 'Preston', 'প্রেস্টন', 53.76, -2.7],
  ['gb-sunderland', 'Sunderland', 'সান্ডারল্যান্ড', 54.91, -1.38],
  ['gb-newcastle', 'Newcastle upon Tyne', 'নিউক্যাসল', 54.98, -1.61],
  ['gb-middlesbrough', 'Middlesbrough', 'মিডলসব্রো', 54.57, -1.23],
  ['gb-nottingham', 'Nottingham', 'নটিংহাম', 52.95, -1.15],
  ['gb-coventry', 'Coventry', 'কভেন্ট্রি', 52.41, -1.51],
  ['gb-slough', 'Slough', 'স্লো', 51.51, -0.59],
  ['gb-miltonkeynes', 'Milton Keynes', 'মিল্টন কেইনস', 52.04, -0.76],

  // ----- United States -----
  ['us-newyork', 'New York', 'নিউ ইয়র্ক', 40.71, -74.01],
  ['us-brooklyn', 'Brooklyn', 'ব্রুকলিন', 40.68, -73.94],
  ['us-buffalo', 'Buffalo', 'বাফেলো', 42.89, -78.88],
  ['us-detroit', 'Detroit', 'ডেট্রয়েট', 42.33, -83.05],
  ['us-hamtramck', 'Hamtramck', 'হ্যামট্রামেক', 42.39, -83.05],
  ['us-chicago', 'Chicago', 'শিকাগো', 41.88, -87.63],
  ['us-philadelphia', 'Philadelphia', 'ফিলাডেলফিয়া', 39.95, -75.17],
  ['us-paterson', 'Paterson', 'প্যাটারসন', 40.92, -74.17],
  ['us-jerseycity', 'Jersey City', 'জার্সি সিটি', 40.73, -74.08],
  ['us-boston', 'Boston', 'বস্টন', 42.36, -71.06],
  ['us-washington', 'Washington, D.C.', 'ওয়াশিংটন', 38.91, -77.04],
  ['us-baltimore', 'Baltimore', 'বাল্টিমোর', 39.29, -76.61],
  ['us-atlanta', 'Atlanta', 'আটলান্টা', 33.75, -84.39],
  ['us-miami', 'Miami', 'মায়ামি', 25.76, -80.19],
  ['us-tampa', 'Tampa', 'টাম্পা', 27.95, -82.46],
  ['us-orlando', 'Orlando', 'অরল্যান্ডো', 28.54, -81.38],
  ['us-jacksonville', 'Jacksonville', 'জ্যাকসনভিল', 30.33, -81.66],
  ['us-houston', 'Houston', 'হিউস্টন', 29.76, -95.37],
  ['us-dallas', 'Dallas', 'ডালাস', 32.78, -96.8],
  ['us-austin', 'Austin', 'অস্টিন', 30.27, -97.74],
  ['us-sanantonio', 'San Antonio', 'স্যান অ্যান্টোনিও', 29.42, -98.49],
  ['us-losangeles', 'Los Angeles', 'লস অ্যাঞ্জেলেস', 34.05, -118.24],
  ['us-sandiego', 'San Diego', 'সান ডিয়েগো', 32.72, -117.16],
  ['us-sanfrancisco', 'San Francisco', 'সান ফ্রান্সিসকো', 37.77, -122.42],
  ['us-sanjose', 'San Jose', 'সান হোসে', 37.34, -121.89],
  ['us-sacramento', 'Sacramento', 'স্যাক্রামেন্টো', 38.58, -121.49],
  ['us-fresno', 'Fresno', 'ফ্রেজনো', 36.75, -119.77],
  ['us-seattle', 'Seattle', 'সিয়াটল', 47.61, -122.33],
  ['us-portland', 'Portland', 'পোর্টল্যান্ড', 45.52, -122.68],
  ['us-phoenix', 'Phoenix', 'ফিনিক্স', 33.45, -112.07],
  ['us-denver', 'Denver', 'ডেনভার', 39.74, -104.99],
  ['us-lasvegas', 'Las Vegas', 'লাস ভেগাস', 36.17, -115.14],
  ['us-slc', 'Salt Lake City', 'সল্ট লেক সিটি', 40.76, -111.89],
  ['us-minneapolis', 'Minneapolis', 'মিনিয়াপলিস', 44.98, -93.27],
  ['us-kansascity', 'Kansas City', 'ক্যানসাস সিটি', 39.1, -94.58],
  ['us-stlouis', 'St. Louis', 'সেন্ট লুইস', 38.63, -90.2],
  ['us-milwaukee', 'Milwaukee', 'মিলওয়াকি', 43.04, -87.91],
  ['us-columbus', 'Columbus', 'কলাম্বাস', 39.96, -83.0],
  ['us-cleveland', 'Cleveland', 'ক্লিভল্যান্ড', 41.5, -81.69],
  ['us-cincinnati', 'Cincinnati', 'সিনসিনাটি', 39.1, -84.51],
  ['us-nashville', 'Nashville', 'ন্যাশভিল', 36.16, -86.78],
  ['us-charlotte', 'Charlotte', 'শার্লট', 35.23, -80.84],
  ['us-raleigh', 'Raleigh', 'র‍্যালি', 35.78, -78.64],
  ['us-neworleans', 'New Orleans', 'নিউ অরলিন্স', 29.95, -90.07],

  // ----- Canada -----
  ['ca-toronto', 'Toronto', 'টরন্টো', 43.65, -79.38],
  ['ca-mississauga', 'Mississauga', 'মিসিসাগা', 43.59, -79.64],
  ['ca-ottawa', 'Ottawa', 'অটোয়া', 45.42, -75.7],
  ['ca-montreal', 'Montreal', 'মন্ট্রিল', 45.5, -73.57],
  ['ca-vancouver', 'Vancouver', 'ভ্যানকুভার', 49.28, -123.12],
  ['ca-calgary', 'Calgary', 'ক্যালগারি', 51.05, -114.07],
  ['ca-edmonton', 'Edmonton', 'এডমন্টন', 53.55, -113.49],
  ['ca-winnipeg', 'Winnipeg', 'উইনিপেগ', 49.9, -97.14],
  ['ca-hamilton', 'Hamilton', 'হ্যামিল্টন', 43.26, -79.87],
  ['ca-windsor', 'Windsor', 'উইন্ডসর', 42.32, -83.04],

  // ----- Gulf -----
  ['ae-dubai', 'Dubai', 'দুবাই', 25.2, 55.27],
  ['ae-abudhabi', 'Abu Dhabi', 'আবুধাবি', 24.45, 54.38],
  ['ae-sharjah', 'Sharjah', 'শারজাহ', 25.35, 55.39],
  ['ae-ajman', 'Ajman', 'আজমান', 25.4, 55.44],
  ['ae-alain', 'Al Ain', 'আল আইন', 24.21, 55.76],
  ['qa-doha', 'Doha', 'দোহা', 25.29, 51.53],
  ['sa-riyadh', 'Riyadh', 'রিয়াদ', 24.71, 46.68],
  ['sa-jeddah', 'Jeddah', 'জেদ্দা', 21.49, 39.19],
  ['sa-makkah', 'Makkah', 'মক্কা', 21.42, 39.83],
  ['sa-madinah', 'Madinah', 'মদিনা', 24.52, 39.57],
  ['sa-dammam', 'Dammam', 'দাম্মাম', 26.42, 50.09],
  ['sa-khobar', 'Al Khobar', 'খোবার', 26.28, 50.21],
  ['kw-kuwaitcity', 'Kuwait City', 'কুয়েত সিটি', 29.38, 47.99],
  ['om-muscat', 'Muscat', 'মাস্কট', 23.59, 58.41],
  ['bh-manama', 'Manama', 'মানামা', 26.23, 50.59],

  // ----- Southeast Asia -----
  ['my-kualalumpur', 'Kuala Lumpur', 'কুয়ালালামপুর', 3.14, 101.69],
  ['my-shahalam', 'Shah Alam', 'শাহ আলম', 3.07, 101.52],
  ['my-penang', 'George Town (Penang)', 'পেনাং', 5.41, 100.33],
  ['my-johorbahru', 'Johor Bahru', 'জোহর বাহরু', 1.49, 103.74],
  ['my-ipoh', 'Ipoh', 'ইপোহ', 4.6, 101.08],
  ['sg-singapore', 'Singapore', 'সিঙ্গাপুর', 1.35, 103.82],
  ['bn-bandar', 'Bandar Seri Begawan', 'ব্রুনাই', 4.9, 114.94],

  // ----- Australia -----
  ['au-sydney', 'Sydney', 'সিডনি', -33.87, 151.21],
  ['au-melbourne', 'Melbourne', 'মেলবোর্ন', -37.81, 144.96],
  ['au-brisbane', 'Brisbane', 'ব্রিসবেন', -27.47, 153.03],
  ['au-perth', 'Perth', 'পার্থ', -31.95, 115.86],
  ['au-adelaide', 'Adelaide', 'অ্যাডিলেড', -34.93, 138.6],
  ['au-canberra', 'Canberra', 'ক্যানবেরা', -35.28, 149.13],

  // ----- Europe -----
  ['it-rome', 'Rome', 'রোম', 41.9, 12.5],
  ['it-milan', 'Milan', 'মিলান', 45.46, 9.19],
  ['it-brescia', 'Brescia', 'ব্রেশিয়া', 45.54, 10.21],
  ['it-turin', 'Turin', 'তুরিন', 45.07, 7.69],
  ['it-naples', 'Naples', 'নেপলস', 40.85, 14.27],
  ['es-barcelona', 'Barcelona', 'বার্সেলোনা', 41.39, 2.17],
  ['es-madrid', 'Madrid', 'মাদ্রিদ', 40.42, -3.7],
  ['fr-paris', 'Paris', 'প্যারিস', 48.86, 2.35],
  ['de-berlin', 'Berlin', 'বার্লিন', 52.52, 13.4],
  ['de-frankfurt', 'Frankfurt', 'ফ্রাঙ্কফুর্ট', 50.11, 8.68],
  ['de-hamburg', 'Hamburg', 'হামবুর্গ', 53.55, 9.99],
  ['de-munich', 'Munich', 'মিউনিখ', 48.14, 11.58],
  ['nl-amsterdam', 'Amsterdam', 'অ্যামস্টারডাম', 52.37, 4.9],
  ['nl-hague', 'The Hague', 'দ্য হেগ', 52.08, 4.31],
  ['nl-rotterdam', 'Rotterdam', 'রটারডাম', 51.92, 4.48],
  ['be-brussels', 'Brussels', 'ব্রাসেলস', 50.85, 4.35],
  ['se-stockholm', 'Stockholm', 'স্টকহোম', 59.33, 18.07],
  ['no-oslo', 'Oslo', 'অসলো', 59.91, 10.75],
  ['dk-copenhagen', 'Copenhagen', 'কোপেনহেগেন', 55.68, 12.57],
  ['ie-dublin', 'Dublin', 'ডাবলিন', 53.35, -6.26],
  ['at-vienna', 'Vienna', 'ভিয়েনা', 48.21, 16.37],
  ['ch-zurich', 'Zurich', 'জুরিখ', 47.38, 8.54],
  ['gr-athens', 'Athens', 'এথেন্স', 37.98, 23.73],

  // ----- East Asia -----
  ['kr-seoul', 'Seoul', 'সিউল', 37.57, 126.98],
  ['jp-tokyo', 'Tokyo', 'টোকিও', 35.68, 139.69],

  // ----- South Asia (neighbours) -----
  ['in-kolkata', 'Kolkata', 'কলকাতা', 22.57, 88.36],
  ['in-delhi', 'New Delhi', 'নয়াদিল্লি', 28.61, 77.21],
  ['in-mumbai', 'Mumbai', 'মুম্বাই', 19.08, 72.88],
  ['in-hyderabad', 'Hyderabad', 'হায়দ্রাবাদ', 17.39, 78.49],
  ['in-chennai', 'Chennai', 'চেন্নাই', 13.08, 80.27],
  ['in-bengaluru', 'Bengaluru', 'বেঙ্গালুরু', 12.97, 77.59],
  ['in-lucknow', 'Lucknow', 'লখনউ', 26.85, 80.95],
  ['pk-karachi', 'Karachi', 'করাচি', 24.86, 67.01],
  ['pk-lahore', 'Lahore', 'লাহোর', 31.55, 74.34],
  ['pk-islamabad', 'Islamabad', 'ইসলামাবাদ', 33.68, 73.05],
  ['lk-colombo', 'Colombo', 'কলম্বো', 6.93, 79.86],
  ['mv-male', 'Malé', 'মালে', 4.18, 73.51],
];

export const PRAYER_CITIES: PrayerCity[] = ROWS.map(([id, name, nameBn, lat, lng]) => ({
  id,
  name,
  nameBn,
  lat,
  lng,
}));

/** Offline, case-insensitive search over the English AND Bangla names. */
export function searchCities(query: string, limit = 8): PrayerCity[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const matches = PRAYER_CITIES.filter(
    city => city.name.toLowerCase().includes(q) || city.nameBn.includes(query.trim())
  );
  // Prefix matches first, so "dh" surfaces Dhaka before Feni-district noise.
  return matches
    .sort((a, b) => {
      const aPrefix = a.name.toLowerCase().startsWith(q) || a.nameBn.startsWith(query.trim())
        ? 0 : 1;
      const bPrefix = b.name.toLowerCase().startsWith(q) || b.nameBn.startsWith(query.trim())
        ? 0 : 1;
      return aPrefix - bPrefix;
    })
    .slice(0, limit);
}

/** Look a city back up by id (bn label rendering for a saved location). */
export function cityById(id: string): PrayerCity | undefined {
  return PRAYER_CITIES.find(city => city.id === id);
}
