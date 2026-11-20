import { ClientConfig } from '../types';

export const INDUSTRY_PRESETS: Record<string, ClientConfig> = {
  hvac: {
    clientId: 'preset-hvac',
    leadSource: 'Google Search / Local Directory',
    googleBusinessProfileUrl: '',
    businessPhone: '',
    serviceArea: '',

    industry: 'HVAC - Heating & Air Conditioning',
    businessName: 'Air Conditioning & Heating Services',
    tagline: 'Professional Heating & Cooling Solutions',
    heroTitle: 'Reliable AC & Heating Repair & Maintenance',
    heroSubheadline: 'Expert technicians for all your cooling, heating, and air quality needs. Upfront pricing and quality service.',
    yearsInBusiness: 0,
    jobsCompleted: '',
    averageRating: 0,
    reviewCount: 0,

    phone: '',
    phoneRaw: '',
    email: '',
    address: '',
    cityStateZip: '',
    businessHours: 'Mon-Sun: 8:00 AM - 8:00 PM',
    emergencyAvailability: '',
    whatsAppNumber: '',

    primaryColor: '#0F172A',
    accentColor: '#2563EB',
    fontFamily: 'Inter, sans-serif',
    logoUrl: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=200&auto=format&fit=crop&q=80',
    heroImageUrl: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=1200&auto=format&fit=crop&q=80',
    aboutImageUrl: 'https://images.unsplash.com/photo-1581094288338-2314dddb7ece?w=800&auto=format&fit=crop&q=80',

    googleMapsLink: '',
    googleMapsEmbedUrl: '',
    googleReviewLink: '',
    googleBusinessProfileLink: '',
    formEndpoint: '',
    googleAnalyticsId: '',
    facebookPixelId: '',
    googleTagManagerId: '',

    socialLinks: {},

    seo: {
      title: 'Air Conditioning & Heating Services',
      metaDescription: 'Professional HVAC repair, maintenance, and installation.',
      keywords: ['HVAC repair', 'AC service', 'Heating maintenance'],
      ogImageUrl: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=1200&auto=format&fit=crop&q=80',
      canonicalUrl: '',
    },

    serviceAreas: [],
    stats: [],
    testimonials: [],
    beforeAfter: [],
    financingEnabled: false,
    hasEmergencyService: true,

    whyUsItems: [
      { title: 'Upfront Flat-Rate Pricing', description: 'Written price estimates provided before work begins with zero hidden charges.' },
      { title: 'Prompt & Reliable Service', description: 'Fast response times and dedicated service for all your heating and cooling needs.' },
      { title: 'Licensed & Certified Professionals', description: 'Experienced technicians committed to quality workmanship and safety.' },
    ],

    trustBadges: [
      { title: 'Licensed & Certified', subtitle: 'Qualified Technical Team', icon: 'ShieldCheck' },
      { title: 'Upfront Pricing', subtitle: 'Clear Estimates First', icon: 'DollarSign' },
      { title: 'Quality Guaranteed', subtitle: 'Workmanship Warranty', icon: 'Award' },
    ],

    services: [
      {
        id: 'ac-repair',
        title: 'AC Repair & Troubleshooting',
        tagline: 'Restore your cooling fast',
        description: 'Comprehensive diagnostic and repair for split ACs, window units, and central cooling systems.',
        iconName: 'Snowflake',
        features: ['Diagnostic Inspection', 'Compressor & Fan Repair', 'Refrigerant Leak Fix', 'Prompt Service'],
        popular: true,
      },
      {
        id: 'ac-servicing',
        title: 'AC Servicing & Preventive Maintenance',
        tagline: 'Keep your cooling running efficiently',
        description: 'Preventative maintenance, coil cleaning, filter replacement, and system performance tuning.',
        iconName: 'Zap',
        features: ['Filter Cleaning & Replacement', 'Coil & Fin Cleaning', 'Performance Diagnostics', 'Energy Efficiency Check'],
      },
      {
        id: 'ac-install',
        title: 'AC Unit Installation & Upgrades',
        tagline: 'Energy-efficient cooling systems',
        description: 'Professional sizing and installation of modern, energy-efficient air conditioning systems.',
        iconName: 'Flame',
        features: ['In-Home Sizing Assessment', 'Brand & Capacity Options', 'Old Unit Haul-Away', 'System Testing'],
      },
      {
        id: 'indoor-air',
        title: 'Duct Cleaning & Indoor Air Quality',
        tagline: 'Breathe cleaner air',
        description: 'Air duct sanitization, air filter replacement, and indoor moisture management.',
        iconName: 'Wind',
        features: ['Duct Inspection', 'Air Purification Solutions', 'Allergen Reduction', 'Filter Replacement'],
      }
    ],

    faqs: [
      {
        question: 'Do you provide upfront pricing before starting work?',
        answer: 'Yes. We perform a diagnostic inspection and provide a clear, written estimate before starting any work.'
      },
      {
        question: 'What types of air conditioning units do you service?',
        answer: 'We service split air conditioners, ductless mini-splits, window units, and central HVAC systems.'
      },
      {
        question: 'How frequently should an AC unit be serviced?',
        answer: 'Regular servicing is recommended once or twice a year to maintain cooling efficiency and prevent unexpected breakdowns.'
      }
    ]
  },

  plumbing: {
    package: 'both',
    industryProfile: 'plumbing',
    crmTerminology: {
      leadLabel: 'Customer / Enquiry',
      serviceLabel: 'Plumbing Issue / Service',
      pipelineStageLabel: 'Job Status',
      actionLabel: 'Schedule Service',
    },
    defaultFollowUpDays: 1,
    whatsAppMessageTemplate: 'Hi {name}, this is {businessName} regarding your {service} enquiry. We have a licensed plumber available in your area. What time works best for an on-site inspection or estimate?',

    clientId: 'preset-plumbing',
    leadSource: 'Google Search / Local Directory',
    googleBusinessProfileUrl: '',
    businessPhone: '',
    serviceArea: '',

    industry: 'Plumbing & Drain Cleaning',
    businessName: 'Plumbing & Drain Services',
    tagline: 'Professional Plumbing Solutions',
    heroTitle: 'Fast & Reliable Local Plumbing & Drain Repair',
    heroSubheadline: 'Licensed plumbing professionals for drain clearing, pipe repairs, leak detection, and water heater servicing.',
    yearsInBusiness: 0,
    jobsCompleted: '',
    averageRating: 0,
    reviewCount: 0,

    phone: '',
    phoneRaw: '',
    email: '',
    address: '',
    cityStateZip: '',
    businessHours: 'Mon-Sun: 8:00 AM - 8:00 PM',
    emergencyAvailability: '',
    whatsAppNumber: '',

    primaryColor: '#0C4A6E',
    accentColor: '#0284C7',
    fontFamily: 'Inter, sans-serif',
    logoUrl: 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=200&auto=format&fit=crop&q=80',
    heroImageUrl: 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=1200&auto=format&fit=crop&q=80',
    aboutImageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800&auto=format&fit=crop&q=80',

    googleMapsLink: '',
    googleMapsEmbedUrl: '',
    googleReviewLink: '',
    googleBusinessProfileLink: '',
    formEndpoint: '',
    googleAnalyticsId: '',
    facebookPixelId: '',
    googleTagManagerId: '',

    socialLinks: {},

    seo: {
      title: 'Plumbing & Drain Services',
      metaDescription: 'Professional plumbing repairs, drain clearing, and leak detection.',
      keywords: ['Plumbing', 'Drain cleaning', 'Leak detection'],
      ogImageUrl: 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=1200&auto=format&fit=crop&q=80',
      canonicalUrl: '',
    },

    serviceAreas: [],
    stats: [],
    testimonials: [],
    beforeAfter: [],
    financingEnabled: false,
    hasEmergencyService: true,

    whyUsItems: [
      { title: 'Transparent Upfront Pricing', description: 'Know the cost before work starts with no unexpected charges.' },
      { title: 'Prompt Local Response', description: 'Quick, dependable scheduling for urgent plumbing needs.' },
      { title: 'Qualified Plumbers', description: 'Equipped with modern tools and camera inspection gear.' },
    ],

    trustBadges: [
      { title: 'Licensed Plumbers', subtitle: 'Certified Experts', icon: 'ShieldCheck' },
      { title: 'Upfront Pricing', subtitle: 'Clear Quotes First', icon: 'DollarSign' },
      { title: 'HD Camera Inspection', subtitle: 'Precision Diagnostics', icon: 'Video' },
    ],

    services: [
      {
        id: 'drain-cleaning',
        title: 'Drain & Sewer Clearing',
        tagline: 'Clear stubborn clogs effectively',
        description: 'Drain cleaning, blockage removal, and pipe inspection to keep water flowing smoothly.',
        iconName: 'Droplets',
        features: ['Camera Pipe Inspection', 'Rooter & Jetting Service', 'Clog Clearing', 'Preventative Advice'],
        popular: true,
      },
      {
        id: 'water-heaters',
        title: 'Water Heater Servicing & Repair',
        tagline: 'Reliable hot water supply',
        description: 'Servicing, maintenance, and replacement for standard tank and tankless water heaters.',
        iconName: 'Flame',
        features: ['Temperature & Pressure Checks', 'Tank Flushing', 'Element Replacement', 'New Unit Installation'],
      },
      {
        id: 'leak-detection',
        title: 'Pipe & Leak Repair',
        tagline: 'Locate and fix hidden water leaks',
        description: 'Non-destructive leak detection and pipe repairs for kitchens, bathrooms, and water lines.',
        iconName: 'Search',
        features: ['Acoustic & Pressure Testing', 'Pipe Patching & Replacement', 'Fixture Leak Repairs', 'Water Line Checks'],
      }
    ],

    faqs: [
      {
        question: 'What should I do if a water pipe starts leaking?',
        answer: 'Locate and turn off your main water valve to prevent water damage, then contact our service hotline.'
      },
      {
        question: 'Do you offer upfront estimates?',
        answer: 'Yes, we assess the problem on-site and provide an upfront price before any work begins.'
      }
    ]
  },

  roofing: {
    clientId: 'preset-roofing',
    leadSource: 'Google Search / Local Directory',
    googleBusinessProfileUrl: '',
    businessPhone: '',
    serviceArea: '',

    industry: 'Roofing & Construction',
    businessName: 'Roofing & Construction Services',
    tagline: 'Durable Roof Protection & Repairs',
    heroTitle: 'Quality Roofing Repairs & Roof Replacement',
    heroSubheadline: 'Experienced local roofing specialists for roof leaks, tile replacements, waterproofing, and new roof installations.',
    yearsInBusiness: 0,
    jobsCompleted: '',
    averageRating: 0,
    reviewCount: 0,

    phone: '',
    phoneRaw: '',
    email: '',
    address: '',
    cityStateZip: '',
    businessHours: 'Mon-Sat: 7:00 AM - 7:00 PM',
    emergencyAvailability: '',
    whatsAppNumber: '',

    primaryColor: '#1E293B',
    accentColor: '#DC2626',
    fontFamily: 'Inter, sans-serif',
    logoUrl: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=200&auto=format&fit=crop&q=80',
    heroImageUrl: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1200&auto=format&fit=crop&q=80',
    aboutImageUrl: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&auto=format&fit=crop&q=80',

    googleMapsLink: '',
    googleMapsEmbedUrl: '',
    googleReviewLink: '',
    googleBusinessProfileLink: '',
    formEndpoint: '',
    googleAnalyticsId: '',
    facebookPixelId: '',
    googleTagManagerId: '',

    socialLinks: {},

    seo: {
      title: 'Roofing & Construction Services',
      metaDescription: 'Professional roof inspections, repairs, waterproofing, and replacements.',
      keywords: ['Roofing repair', 'Roof replacement', 'Waterproofing'],
      ogImageUrl: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1200&auto=format&fit=crop&q=80',
      canonicalUrl: '',
    },

    serviceAreas: [],
    stats: [],
    testimonials: [],
    beforeAfter: [],
    financingEnabled: false,
    hasEmergencyService: true,

    whyUsItems: [
      { title: 'Quality Materials', description: 'We use high-grade roofing products designed for lasting weather resistance.' },
      { title: 'Experienced Craftsmen', description: 'Skilled roofing contractors focused on safety and precision.' },
      { title: 'Detailed Inspections', description: 'Thorough roof assessment before recommending repairs or replacements.' },
    ],

    trustBadges: [
      { title: 'Licensed Roofers', subtitle: 'Certified & Insured', icon: 'ShieldCheck' },
      { title: 'Free Inspection', subtitle: 'Detailed Roof Assessment', icon: 'FileText' },
      { title: 'Warranty Protected', subtitle: 'Workmanship Guarantee', icon: 'Award' },
    ],

    services: [
      {
        id: 'roof-repair',
        title: 'Roof Leak Repair & Waterproofing',
        tagline: 'Stop water seepage fast',
        description: 'Locate and repair roof leaks, damaged tiles, flashing issues, and valley water infiltration.',
        iconName: 'CloudRain',
        features: ['Leak Assessment', 'Flashing Repair', 'Tile & Shingle Replacement', 'Waterproof Coating'],
        popular: true,
      },
      {
        id: 'roof-replacement',
        title: 'Full Roof Replacement',
        tagline: 'Long-lasting structural roof installations',
        description: 'Complete roof tear-off, underlayment installation, and new roofing materials for residential and commercial structures.',
        iconName: 'Home',
        features: ['Complete Roof Assessment', 'Quality Underlayment', 'Multiple Material Options', 'Cleanup & Haul-Away'],
      }
    ],

    faqs: [
      {
        question: 'How do I know if my roof needs a repair or full replacement?',
        answer: 'We conduct an on-site inspection to assess roof condition, age, and extent of damage before recommending repair or replacement.'
      }
    ]
  },

  electricians: {
    clientId: 'preset-electricians',
    leadSource: 'Google Search / Local Directory',
    googleBusinessProfileUrl: '',
    businessPhone: '',
    serviceArea: '',

    industry: 'Electrical Services',
    businessName: 'Electrical Services & Contracting',
    tagline: 'Safe & Certified Electrical Work',
    heroTitle: 'Certified Electrical Repairs, Wiring & Panel Upgrades',
    heroSubheadline: 'Licensed electrical contractors for residential wiring, breaker repairs, lighting installs, and safety inspections.',
    yearsInBusiness: 0,
    jobsCompleted: '',
    averageRating: 0,
    reviewCount: 0,

    phone: '',
    phoneRaw: '',
    email: '',
    address: '',
    cityStateZip: '',
    businessHours: 'Mon-Sun: 7:00 AM - 9:00 PM',
    emergencyAvailability: '',
    whatsAppNumber: '',

    primaryColor: '#18181B',
    accentColor: '#EAB308',
    fontFamily: 'Inter, sans-serif',
    logoUrl: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=200&auto=format&fit=crop&q=80',
    heroImageUrl: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=1200&auto=format&fit=crop&q=80',
    aboutImageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800&auto=format&fit=crop&q=80',

    googleMapsLink: '',
    googleMapsEmbedUrl: '',
    googleReviewLink: '',
    googleBusinessProfileLink: '',
    formEndpoint: '',
    googleAnalyticsId: '',
    facebookPixelId: '',
    googleTagManagerId: '',

    socialLinks: {},

    seo: {
      title: 'Electrical Services & Contracting',
      metaDescription: 'Professional electrical repairs, wiring, lighting, and panel upgrades.',
      keywords: ['Electrician', 'Electrical wiring', 'Panel upgrade'],
      ogImageUrl: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=1200&auto=format&fit=crop&q=80',
      canonicalUrl: '',
    },

    serviceAreas: [],
    stats: [],
    testimonials: [],
    beforeAfter: [],
    financingEnabled: false,
    hasEmergencyService: true,

    whyUsItems: [
      { title: 'Licensed Electricians', description: 'Trained and certified professionals focused on electrical safety.' },
      { title: 'Upfront Pricing', description: 'Clear estimates prior to beginning any electrical work.' },
      { title: 'Code Compliant Work', description: 'All installations and repairs adhere to safety standards.' },
    ],

    trustBadges: [
      { title: 'Licensed & Certified', subtitle: 'Electrical Safety First', icon: 'ShieldCheck' },
      { title: 'Code Compliant', subtitle: 'Standard Approved', icon: 'CheckCircle' },
      { title: 'Upfront Pricing', subtitle: 'Clear Quotes First', icon: 'DollarSign' },
    ],

    services: [
      {
        id: 'electrical-repair',
        title: 'Electrical Troubleshooting & Repairs',
        tagline: 'Fix tripping breakers & faulty outlets',
        description: 'Diagnostic inspection for power fluctuations, short circuits, switch repairs, and outlet replacements.',
        iconName: 'Zap',
        features: ['Circuit Diagnostics', 'Breaker Repair', 'GFCI Switch Installation', 'Safety Check'],
        popular: true,
      },
      {
        id: 'panel-upgrade',
        title: 'Distribution Panel Upgrades & Rewiring',
        tagline: 'Modernize home electrical capacity',
        description: 'Upgrade distribution boards, main breakers, and safety switches for high-demand modern electrical loads.',
        iconName: 'Zap',
        features: ['Main Breaker Replacement', 'Surge Protection', 'Load Balancing', 'Safety Inspection'],
      }
    ],

    faqs: [
      {
        question: 'Why does my circuit breaker keep tripping?',
        answer: 'Tripping breakers usually indicate an overloaded circuit, a short circuit, or a ground fault. Our electrician can safely diagnose the cause.'
      }
    ]
  },

  'garage-door': {
    clientId: 'preset-garage-door',
    leadSource: 'Google Search / Local Directory',
    googleBusinessProfileUrl: '',
    businessPhone: '',
    serviceArea: '',

    industry: 'Garage Door Repair & Service',
    businessName: 'Garage Door Services',
    tagline: 'Fast & Reliable Garage Door Solutions',
    heroTitle: 'Garage Door Repair, Spring Replacement & Openers',
    heroSubheadline: 'Professional garage door technicians for broken springs, off-track doors, opener installation, and safety tuning.',
    yearsInBusiness: 0,
    jobsCompleted: '',
    averageRating: 0,
    reviewCount: 0,

    phone: '',
    phoneRaw: '',
    email: '',
    address: '',
    cityStateZip: '',
    businessHours: 'Mon-Sun: 7:00 AM - 8:00 PM',
    emergencyAvailability: '',
    whatsAppNumber: '',

    primaryColor: '#111827',
    accentColor: '#F97316',
    fontFamily: 'Inter, sans-serif',
    logoUrl: 'https://images.unsplash.com/photo-1558036117-15d82a90b9b1?w=200&auto=format&fit=crop&q=80',
    heroImageUrl: 'https://images.unsplash.com/photo-1558036117-15d82a90b9b1?w=1200&auto=format&fit=crop&q=80',
    aboutImageUrl: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=800&auto=format&fit=crop&q=80',

    googleMapsLink: '',
    googleMapsEmbedUrl: '',
    googleReviewLink: '',
    googleBusinessProfileLink: '',
    formEndpoint: '',
    googleAnalyticsId: '',
    facebookPixelId: '',
    googleTagManagerId: '',

    socialLinks: {},

    seo: {
      title: 'Garage Door Services',
      metaDescription: 'Professional garage door spring repair, opener installation, and maintenance.',
      keywords: ['Garage door repair', 'Spring replacement', 'Door opener'],
      ogImageUrl: 'https://images.unsplash.com/photo-1558036117-15d82a90b9b1?w=1200&auto=format&fit=crop&q=80',
      canonicalUrl: '',
    },

    serviceAreas: [],
    stats: [],
    testimonials: [],
    beforeAfter: [],
    financingEnabled: false,
    hasEmergencyService: true,

    whyUsItems: [
      { title: 'Prompt Local Dispatch', description: 'Quick scheduling for stuck doors or broken springs.' },
      { title: 'Quality Replacement Parts', description: 'High-cycle springs, cables, and durable garage door openers.' },
      { title: 'Clear Estimates', description: 'Upfront quotes provided before starting repair work.' },
    ],

    trustBadges: [
      { title: 'Certified Technicians', subtitle: 'Door Specialists', icon: 'ShieldCheck' },
      { title: 'Quality Parts', subtitle: 'High Cycle Hardware', icon: 'Wrench' },
      { title: 'Upfront Pricing', subtitle: 'Clear Estimates First', icon: 'DollarSign' },
    ],

    services: [
      {
        id: 'spring-repair',
        title: 'Broken Spring & Cable Replacement',
        tagline: 'Safely restore door balance',
        description: 'Safe removal and replacement of high-tension torsion or extension springs and frayed steel cables.',
        iconName: 'Wrench',
        features: ['High-Cycle Springs', 'Cable Replacement', 'Door Balance Testing', 'Track Alignment'],
        popular: true,
      },
      {
        id: 'opener-install',
        title: 'Automatic Garage Door Opener Installation',
        tagline: 'Smooth, quiet motorized operation',
        description: 'Installation and repair of belt-drive, chain-drive, and smart phone enabled garage door openers.',
        iconName: 'Zap',
        features: ['Smart Opener Setup', 'Safety Sensor Adjustment', 'Remote Control Pairing', 'Quiet Belt Drives'],
      }
    ],

    faqs: [
      {
        question: 'Can I replace a broken garage door spring myself?',
        answer: 'Garage door springs operate under intense tension and can be dangerous to replace without specialized tools and training.'
      }
    ]
  },

  locksmith: {
    clientId: 'preset-locksmith',
    leadSource: 'Google Search / Local Directory',
    googleBusinessProfileUrl: '',
    businessPhone: '',
    serviceArea: '',

    industry: 'Locksmith & Security Services',
    businessName: 'Locksmith & Security Services',
    tagline: 'Fast Local Locksmith Solutions',
    heroTitle: 'Mobile Locksmith, Lock Replacement & Key Services',
    heroSubheadline: 'Professional mobile locksmiths for home, commercial, and vehicle lockouts, lock rekeying, and smart locks.',
    yearsInBusiness: 0,
    jobsCompleted: '',
    averageRating: 0,
    reviewCount: 0,

    phone: '',
    phoneRaw: '',
    email: '',
    address: '',
    cityStateZip: '',
    businessHours: 'Mon-Sun: 24 Hours',
    emergencyAvailability: '',
    whatsAppNumber: '',

    primaryColor: '#0284C7',
    accentColor: '#10B981',
    fontFamily: 'Inter, sans-serif',
    logoUrl: 'https://images.unsplash.com/photo-1582139329536-e7284fece509?w=200&auto=format&fit=crop&q=80',
    heroImageUrl: 'https://images.unsplash.com/photo-1582139329536-e7284fece509?w=1200&auto=format&fit=crop&q=80',
    aboutImageUrl: 'https://images.unsplash.com/photo-1558002038-1055907df827?w=800&auto=format&fit=crop&q=80',

    googleMapsLink: '',
    googleMapsEmbedUrl: '',
    googleReviewLink: '',
    googleBusinessProfileLink: '',
    formEndpoint: '',
    googleAnalyticsId: '',
    facebookPixelId: '',
    googleTagManagerId: '',

    socialLinks: {},

    seo: {
      title: 'Locksmith & Security Services',
      metaDescription: 'Mobile locksmith services, lock rekeying, installation, and lockout assistance.',
      keywords: ['Locksmith', 'Lock rekeying', 'Mobile locksmith'],
      ogImageUrl: 'https://images.unsplash.com/photo-1582139329536-e7284fece509?w=1200&auto=format&fit=crop&q=80',
      canonicalUrl: '',
    },

    serviceAreas: [],
    stats: [],
    testimonials: [],
    beforeAfter: [],
    financingEnabled: false,
    hasEmergencyService: true,

    whyUsItems: [
      { title: 'Mobile Service Vehicles', description: 'Equipped with key cutting and lock installation tools.' },
      { title: 'Transparent Quotes', description: 'Upfront estimate provided before any lockout or lock service begins.' },
      { title: 'Qualified Lock Technicians', description: 'Trained in non-destructive entry methods whenever possible.' },
    ],

    trustBadges: [
      { title: 'Licensed & Verified', subtitle: 'Security Specialist', icon: 'ShieldCheck' },
      { title: 'Mobile Units', subtitle: 'On-Site Lock Service', icon: 'Truck' },
      { title: 'Clear Estimates', subtitle: 'No Hidden Fees', icon: 'DollarSign' },
    ],

    services: [
      {
        id: 'lock-change',
        title: 'Lock Replacement & Rekeying',
        tagline: 'Secure your property',
        description: 'Change worn locks or rekey existing lock cylinders for new keys without replacing hardware.',
        iconName: 'Key',
        features: ['Cylinder Rekeying', 'High-Security Deadbolts', 'Smart Lock Setup', 'Master Keying'],
        popular: true,
      }
    ],

    faqs: [
      {
        question: 'What is the difference between rekeying and changing locks?',
        answer: 'Rekeying changes the internal pins of your existing lock so old keys no longer work. Replacing locks swaps out the entire door hardware.'
      }
    ]
  },

  'pest-control': {
    clientId: 'preset-pest-control',
    leadSource: 'Google Search / Local Directory',
    googleBusinessProfileUrl: '',
    businessPhone: '',
    serviceArea: '',

    industry: 'Pest Control Services',
    businessName: 'Pest Control & Extermination',
    tagline: 'Effective Pest Protection',
    heroTitle: 'Comprehensive Pest Control & Extermination Services',
    heroSubheadline: 'Professional pest control for insects, rodents, termites, and mosquitoes with safe application techniques.',
    yearsInBusiness: 0,
    jobsCompleted: '',
    averageRating: 0,
    reviewCount: 0,

    phone: '',
    phoneRaw: '',
    email: '',
    address: '',
    cityStateZip: '',
    businessHours: 'Mon-Sat: 8:00 AM - 6:00 PM',
    emergencyAvailability: '',
    whatsAppNumber: '',

    primaryColor: '#065F46',
    accentColor: '#059669',
    fontFamily: 'Inter, sans-serif',
    logoUrl: 'https://images.unsplash.com/photo-1584467735871-8e85353a8413?w=200&auto=format&fit=crop&q=80',
    heroImageUrl: 'https://images.unsplash.com/photo-1584467735871-8e85353a8413?w=1200&auto=format&fit=crop&q=80',
    aboutImageUrl: 'https://images.unsplash.com/photo-1584467735871-8e85353a8413?w=800&auto=format&fit=crop&q=80',

    googleMapsLink: '',
    googleMapsEmbedUrl: '',
    googleReviewLink: '',
    googleBusinessProfileLink: '',
    formEndpoint: '',
    googleAnalyticsId: '',
    facebookPixelId: '',
    googleTagManagerId: '',

    socialLinks: {},

    seo: {
      title: 'Pest Control Services',
      metaDescription: 'Targeted pest treatments for insects, rodents, and termites.',
      keywords: ['Pest control', 'Exterminator', 'Termite control'],
      ogImageUrl: 'https://images.unsplash.com/photo-1584467735871-8e85353a8413?w=1200&auto=format&fit=crop&q=80',
      canonicalUrl: '',
    },

    serviceAreas: [],
    stats: [],
    testimonials: [],
    beforeAfter: [],
    financingEnabled: false,
    hasEmergencyService: false,

    whyUsItems: [
      { title: 'Targeted Treatments', description: 'Effective pest management tailored to your property.' },
      { title: 'Family & Pet Conscious', description: 'Responsible application methods and products.' },
      { title: 'Preventative Plans', description: 'Seasonal maintenance options to keep pests away.' },
    ],

    trustBadges: [
      { title: 'Licensed Applicators', subtitle: 'Certified Pest Control', icon: 'ShieldCheck' },
      { title: 'Thorough Inspection', subtitle: 'Property Assessment', icon: 'Search' },
      { title: 'Satisfaction Guarantee', subtitle: 'Re-treatment Options', icon: 'Award' },
    ],

    services: [
      {
        id: 'pest-treatment',
        title: 'General Pest & Insect Treatment',
        tagline: 'Eliminate ants, roaches & spider issues',
        description: 'Detailed inspection and treatment for common household insects and entry point barrier protection.',
        iconName: 'ShieldCheck',
        features: ['Interior & Exterior Inspection', 'Barrier Treatment', 'Eco-Conscious Application', 'Preventative Advice'],
        popular: true,
      }
    ],

    faqs: [
      {
        question: 'Are your pest control treatments safe for pets and children?',
        answer: 'We use application methods following safety guidelines. We provide clear instructions regarding drying times and access.'
      }
    ]
  },

  landscaping: {
    clientId: 'preset-landscaping',
    leadSource: 'Google Search / Local Directory',
    googleBusinessProfileUrl: '',
    businessPhone: '',
    serviceArea: '',

    industry: 'Landscaping & Lawn Care',
    businessName: 'Landscaping & Lawn Care Services',
    tagline: 'Quality Outdoor & Lawn Care',
    heroTitle: 'Lawn Maintenance, Landscaping & Garden Services',
    heroSubheadline: 'Professional lawn care, grass cutting, garden maintenance, tree trimming, and landscape design.',
    yearsInBusiness: 0,
    jobsCompleted: '',
    averageRating: 0,
    reviewCount: 0,

    phone: '',
    phoneRaw: '',
    email: '',
    address: '',
    cityStateZip: '',
    businessHours: 'Mon-Sat: 7:00 AM - 6:00 PM',
    emergencyAvailability: '',
    whatsAppNumber: '',

    primaryColor: '#14532D',
    accentColor: '#16A34A',
    fontFamily: 'Inter, sans-serif',
    logoUrl: 'https://images.unsplash.com/photo-1558904541-efa8c196b27d?w=200&auto=format&fit=crop&q=80',
    heroImageUrl: 'https://images.unsplash.com/photo-1558904541-efa8c196b27d?w=1200&auto=format&fit=crop&q=80',
    aboutImageUrl: 'https://images.unsplash.com/photo-1558904541-efa8c196b27d?w=800&auto=format&fit=crop&q=80',

    googleMapsLink: '',
    googleMapsEmbedUrl: '',
    googleReviewLink: '',
    googleBusinessProfileLink: '',
    formEndpoint: '',
    googleAnalyticsId: '',
    facebookPixelId: '',
    googleTagManagerId: '',

    socialLinks: {},

    seo: {
      title: 'Landscaping & Lawn Care Services',
      metaDescription: 'Professional lawn mowing, garden maintenance, and landscaping design.',
      keywords: ['Lawn care', 'Landscaping', 'Garden maintenance'],
      ogImageUrl: 'https://images.unsplash.com/photo-1558904541-efa8c196b27d?w=1200&auto=format&fit=crop&q=80',
      canonicalUrl: '',
    },

    serviceAreas: [],
    stats: [],
    testimonials: [],
    beforeAfter: [],
    financingEnabled: false,
    hasEmergencyService: false,

    whyUsItems: [
      { title: 'Dependable Schedule', description: 'Timely maintenance visits for consistent curb appeal.' },
      { title: 'Quality Equipment', description: 'Well-maintained commercial mowers and trimming tools.' },
      { title: 'Custom Landscape Plans', description: 'Flexible maintenance packages suited to your lawn.' },
    ],

    trustBadges: [
      { title: 'Experienced Crew', subtitle: 'Lawn Care Professionals', icon: 'ShieldCheck' },
      { title: 'Clear Estimates', subtitle: 'Free On-Site Quotes', icon: 'DollarSign' },
      { title: 'Regular Maintenance', subtitle: 'Flexible Schedules', icon: 'Calendar' },
    ],

    services: [
      {
        id: 'lawn-mowing',
        title: 'Lawn Care & Grass Cutting',
        tagline: 'Neat, healthy lawn maintenance',
        description: 'Scheduled lawn mowing, edging, weed trimming, and lawn cleanup for residential properties.',
        iconName: 'Scissors',
        features: ['Scheduled Mowing', 'Precision Edging', 'Debris Cleanup', 'Fertilization Advice'],
        popular: true,
      }
    ],

    faqs: [
      {
        question: 'Do you offer recurring lawn maintenance schedules?',
        answer: 'Yes, we offer flexible weekly, bi-weekly, or monthly lawn maintenance plans.'
      }
    ]
  },

  cleaning: {
    clientId: 'preset-cleaning',
    leadSource: 'Google Search / Local Directory',
    googleBusinessProfileUrl: '',
    businessPhone: '',
    serviceArea: '',

    industry: 'Cleaning Services',
    businessName: 'Residential & Commercial Cleaning',
    tagline: 'Spotless Cleaning Services',
    heroTitle: 'Home, Office & Deep Cleaning Services',
    heroSubheadline: 'Professional cleaning teams for residential homes, deep cleaning, move-in/move-out cleaning, and commercial offices.',
    yearsInBusiness: 0,
    jobsCompleted: '',
    averageRating: 0,
    reviewCount: 0,

    phone: '',
    phoneRaw: '',
    email: '',
    address: '',
    cityStateZip: '',
    businessHours: 'Mon-Sat: 8:00 AM - 6:00 PM',
    emergencyAvailability: '',
    whatsAppNumber: '',

    primaryColor: '#0369A1',
    accentColor: '#0EA5E9',
    fontFamily: 'Inter, sans-serif',
    logoUrl: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=200&auto=format&fit=crop&q=80',
    heroImageUrl: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1200&auto=format&fit=crop&q=80',
    aboutImageUrl: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&auto=format&fit=crop&q=80',

    googleMapsLink: '',
    googleMapsEmbedUrl: '',
    googleReviewLink: '',
    googleBusinessProfileLink: '',
    formEndpoint: '',
    googleAnalyticsId: '',
    facebookPixelId: '',
    googleTagManagerId: '',

    socialLinks: {},

    seo: {
      title: 'Residential & Commercial Cleaning',
      metaDescription: 'Professional house cleaning, deep cleaning, and office maintenance.',
      keywords: ['House cleaning', 'Office cleaning', 'Deep cleaning'],
      ogImageUrl: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1200&auto=format&fit=crop&q=80',
      canonicalUrl: '',
    },

    serviceAreas: [],
    stats: [],
    testimonials: [],
    beforeAfter: [],
    financingEnabled: false,
    hasEmergencyService: false,

    whyUsItems: [
      { title: 'Trained Cleaners', description: 'Vetted and experienced cleaning professionals.' },
      { title: 'Detailed Checklist', description: 'Comprehensive room-by-room cleaning standards.' },
      { title: 'Flexible Scheduling', description: 'One-time or recurring cleaning packages.' },
    ],

    trustBadges: [
      { title: 'Vetted Team', subtitle: 'Background Checked', icon: 'ShieldCheck' },
      { title: 'Detailed Cleaning', subtitle: 'Room Checklist', icon: 'CheckCircle' },
      { title: 'Clear Rates', subtitle: 'Upfront Quotes', icon: 'DollarSign' },
    ],

    services: [
      {
        id: 'house-cleaning',
        title: 'Residential House Cleaning',
        tagline: 'Clean, comfortable living spaces',
        description: 'Dusting, floor mopping, bathroom sanitization, kitchen cleaning, and general tidying.',
        iconName: 'Sparkles',
        features: ['Kitchen & Bathroom Sanitization', 'Dusting & Vacuuming', 'Trash Removal', 'Surface Wipedown'],
        popular: true,
      }
    ],

    faqs: [
      {
        question: 'Do I need to provide cleaning supplies and equipment?',
        answer: 'Our team comes fully equipped with cleaning products and equipment unless you request specific products to be used.'
      }
    ]
  },

  painting: {
    clientId: 'preset-painting',
    leadSource: 'Google Search / Local Directory',
    googleBusinessProfileUrl: '',
    businessPhone: '',
    serviceArea: '',

    industry: 'Painting Services',
    businessName: 'Interior & Exterior Painting',
    tagline: 'Quality Painting Solutions',
    heroTitle: 'Interior, Exterior & Cabinet Painting',
    heroSubheadline: 'Professional painters for homes and offices. Surface prep, wall priming, crisp lines, and premium paint finishes.',
    yearsInBusiness: 0,
    jobsCompleted: '',
    averageRating: 0,
    reviewCount: 0,

    phone: '',
    phoneRaw: '',
    email: '',
    address: '',
    cityStateZip: '',
    businessHours: 'Mon-Sat: 8:00 AM - 6:00 PM',
    emergencyAvailability: '',
    whatsAppNumber: '',

    primaryColor: '#312E81',
    accentColor: '#6366F1',
    fontFamily: 'Inter, sans-serif',
    logoUrl: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=200&auto=format&fit=crop&q=80',
    heroImageUrl: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=1200&auto=format&fit=crop&q=80',
    aboutImageUrl: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=800&auto=format&fit=crop&q=80',

    googleMapsLink: '',
    googleMapsEmbedUrl: '',
    googleReviewLink: '',
    googleBusinessProfileLink: '',
    formEndpoint: '',
    googleAnalyticsId: '',
    facebookPixelId: '',
    googleTagManagerId: '',

    socialLinks: {},

    seo: {
      title: 'Interior & Exterior Painting',
      metaDescription: 'Professional interior and exterior house painting services.',
      keywords: ['House painting', 'Interior painter', 'Exterior painter'],
      ogImageUrl: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=1200&auto=format&fit=crop&q=80',
      canonicalUrl: '',
    },

    serviceAreas: [],
    stats: [],
    testimonials: [],
    beforeAfter: [],
    financingEnabled: false,
    hasEmergencyService: false,

    whyUsItems: [
      { title: 'Thorough Surface Prep', description: 'Sanding, patching, and priming for long-lasting paint adhesion.' },
      { title: 'Clean Work Environment', description: 'Furniture and floors protected with drop cloths and tape.' },
      { title: 'Upfront Pricing', description: 'Written estimates detailing labor and paint materials.' },
    ],

    trustBadges: [
      { title: 'Experienced Painters', subtitle: 'Detail Oriented', icon: 'ShieldCheck' },
      { title: 'Premium Paints', subtitle: 'Durable Finish', icon: 'CheckCircle' },
      { title: 'Clear Estimates', subtitle: 'No Hidden Costs', icon: 'DollarSign' },
    ],

    services: [
      {
        id: 'interior-painting',
        title: 'Interior House Painting',
        tagline: 'Refresh your indoor living spaces',
        description: 'Walls, ceilings, trim, doors, and cabinet repainting with clean lines and smooth finishes.',
        iconName: 'Palette',
        features: ['Wall Patching & Sanding', 'Primer Application', 'Two Coat Finish', 'Daily Workspace Cleanup'],
        popular: true,
      }
    ],

    faqs: [
      {
        question: 'Do you help with color selection and surface prep?',
        answer: 'Yes! We perform full surface preparation including patching small holes and priming before painting.'
      }
    ]
  },

  handyman: {
    clientId: 'preset-handyman',
    leadSource: 'Google Search / Local Directory',
    googleBusinessProfileUrl: '',
    businessPhone: '',
    serviceArea: '',

    industry: 'Handyman & Home Repair',
    businessName: 'Handyman & Home Repair Services',
    tagline: 'Versatile Home Repair Solutions',
    heroTitle: 'Home Maintenance, Fixture Mounting & Repairs',
    heroSubheadline: 'Reliable craftsman for home repairs, drywall patching, door fixes, furniture assembly, and fixture installations.',
    yearsInBusiness: 0,
    jobsCompleted: '',
    averageRating: 0,
    reviewCount: 0,

    phone: '',
    phoneRaw: '',
    email: '',
    address: '',
    cityStateZip: '',
    businessHours: 'Mon-Sat: 8:00 AM - 6:00 PM',
    emergencyAvailability: '',
    whatsAppNumber: '',

    primaryColor: '#27272A',
    accentColor: '#E11D48',
    fontFamily: 'Inter, sans-serif',
    logoUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=200&auto=format&fit=crop&q=80',
    heroImageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=1200&auto=format&fit=crop&q=80',
    aboutImageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800&auto=format&fit=crop&q=80',

    googleMapsLink: '',
    googleMapsEmbedUrl: '',
    googleReviewLink: '',
    googleBusinessProfileLink: '',
    formEndpoint: '',
    googleAnalyticsId: '',
    facebookPixelId: '',
    googleTagManagerId: '',

    socialLinks: {},

    seo: {
      title: 'Handyman & Home Repair Services',
      metaDescription: 'Reliable handyman services for home repairs, drywall, doors, and fixtures.',
      keywords: ['Handyman', 'Home repair', 'Fixture installation'],
      ogImageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=1200&auto=format&fit=crop&q=80',
      canonicalUrl: '',
    },

    serviceAreas: [],
    stats: [],
    testimonials: [],
    beforeAfter: [],
    financingEnabled: false,
    hasEmergencyService: false,

    whyUsItems: [
      { title: 'Versatile Repairs', description: 'One craftsman for multiple small home repairs.' },
      { title: 'Upfront Rates', description: 'Clear estimates provided prior to starting work.' },
      { title: 'Dependable Service', description: 'Punctual, friendly, and respectful of your home.' },
    ],

    trustBadges: [
      { title: 'Skilled Craftsman', subtitle: 'Versatile Repairs', icon: 'ShieldCheck' },
      { title: 'Upfront Rates', subtitle: 'Clear Pricing', icon: 'DollarSign' },
      { title: 'Quality Service', subtitle: 'Dependable Work', icon: 'CheckCircle' },
    ],

    services: [
      {
        id: 'home-repairs',
        title: 'General Home Maintenance & Repairs',
        tagline: 'Tackle your home to-do list',
        description: 'Drywall patching, door alignment, TV wall mounting, light fixture installation, and general carpentry.',
        iconName: 'Wrench',
        features: ['Drywall Hole Patching', 'TV Wall Mounting', 'Door & Lock Adjustments', 'Cabinet & Shelf Assembly'],
        popular: true,
      }
    ],

    faqs: [
      {
        question: 'Can you handle multiple small tasks in one visit?',
        answer: 'Yes! We encourage compiling a list of small home repair tasks so we can complete them during a single scheduled visit.'
      }
    ]
  },

  // 1. Standardized Industry: Clinic & Healthcare Practice
  clinic: {
    package: 'both',
    industryProfile: 'clinic',
    crmTerminology: {
      leadLabel: 'Patient',
      serviceLabel: 'Clinical Treatment',
      pipelineStageLabel: 'Consultation Stage',
      actionLabel: 'Book Consultation',
    },
    defaultFollowUpDays: 2,
    clientId: 'preset-clinic',
    leadSource: 'Google Search / Local Healthcare Directory',
    googleBusinessProfileUrl: '',
    businessPhone: '',
    serviceArea: '',

    industry: 'Clinic & Healthcare Practice',
    businessName: 'Clinical Healthcare & Aesthetics',
    tagline: 'Doctor-Supervised Patient Care & Modern Consultations',
    heroTitle: 'Doctor-Supervised Clinical Treatments & Patient Care',
    heroSubheadline: 'Comprehensive consultations, advanced medical therapies, and personalized treatment plans in a confidential clinical setting.',
    heroStatusText: 'NEW PATIENT CONSULTATIONS AVAILABLE THIS WEEK',
    heroSecondaryCtaText: 'Explore Treatments',
    leadFormStatusText: 'CONSULTATIONS OPEN',
    leadFormTrustText: '🔒 Strict medical privacy. Your contact details are never shared.',
    finalCtaHeading: 'Schedule Your Private Clinical Consultation',
    finalCtaDescription: 'Consult with board-certified practitioners for a personalized assessment tailored to your health and wellness goals.',
    finalCtaButtonText: 'Request Consultation',
    servicesEyebrow: 'CLINICAL SERVICES & TREATMENTS',
    servicesHeading: 'Advanced Clinical Healthcare & Therapy',
    servicesDescription: 'Evidence-based protocols delivered by licensed medical specialists using modern clinical diagnostic equipment.',
    whyUsHeading: 'Why Patients Trust Our Clinical Practice',
    serviceAreaHeading: 'Clinical Consultations & Modern Facilities',
    serviceAreaDescription: 'Private treatment suites equipped with medical-grade equipment and rigorous hygiene protocols.',
    yearsInBusiness: 0,
    jobsCompleted: '',
    averageRating: 0,
    reviewCount: 0,

    phone: '',
    phoneRaw: '',
    email: '',
    address: '',
    cityStateZip: '',
    businessHours: 'Mon-Sat: 9:00 AM - 6:00 PM',
    emergencyAvailability: '',
    whatsAppNumber: '',
    defaultCountryCode: '+1',
    whatsAppMessageTemplate: 'Hi {name}, thank you for inquiring with {businessName} regarding our {service} consultation. When would be a convenient time for our clinic team to confirm your appointment?',

    primaryColor: '#0F172A',
    accentColor: '#0D9488',
    fontFamily: 'Inter, sans-serif',
    logoUrl: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=200&auto=format&fit=crop&q=80',
    heroImageUrl: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1200&auto=format&fit=crop&q=80',
    aboutImageUrl: 'https://images.unsplash.com/photo-1512290900672-1f486a416a24?w=800&auto=format&fit=crop&q=80',

    googleMapsLink: '',
    googleMapsEmbedUrl: '',
    googleReviewLink: '',
    googleBusinessProfileLink: '',
    formEndpoint: '',
    googleAnalyticsId: '',
    facebookPixelId: '',
    googleTagManagerId: '',

    socialLinks: {},

    seo: {
      title: 'Clinical Healthcare & Aesthetics | Patient Consultations',
      metaDescription: 'Doctor-supervised medical consultations, clinical therapies, and patient-first healthcare.',
      keywords: ['Clinic consultation', 'Medical aesthetics', 'Healthcare practice', 'Doctor appointment'],
      ogImageUrl: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1200&auto=format&fit=crop&q=80',
      canonicalUrl: '',
    },

    serviceAreas: [],
    stats: [],
    testimonials: [],
    beforeAfter: [],
    financingEnabled: false,
    hasEmergencyService: false,

    whyUsItems: [
      { title: 'Doctor-Supervised Practice', description: 'Every clinical protocol is overseen by qualified medical practitioners for patient safety.' },
      { title: 'Hospital-Grade Standards', description: 'Rigorous sterilization and clinical standards maintained across all treatment suites.' },
      { title: 'Personalized Care Plans', description: 'Comprehensive diagnostic assessments tailored to your individual health journey.' },
    ],

    trustBadges: [
      { title: 'Licensed Practitioners', subtitle: 'Board Certified Team', icon: 'ShieldCheck' },
      { title: 'Medical Privacy', subtitle: 'Strict Confidentiality', icon: 'Award' },
      { title: 'Modern Diagnostics', subtitle: 'Evidence-Based Care', icon: 'Sparkles' },
    ],

    services: [
      {
        id: 'diagnostic-consultation',
        title: 'Comprehensive Diagnostic Consultation',
        tagline: 'In-depth clinical assessment',
        description: 'Complete health evaluation mapping symptoms, lifestyle, and diagnostic indicators to create a treatment plan.',
        iconName: 'Search',
        features: ['Detailed Assessment', 'Licensed Practitioner Review', 'Personalized Protocol', 'Transparent Pricing'],
        popular: true,
      },
      {
        id: 'specialized-therapy',
        title: 'Specialized Clinical Therapy & Care',
        tagline: 'Targeted medical therapies',
        description: 'Evidence-based clinical treatments delivered in comfortable private suites using certified equipment.',
        iconName: 'Sparkles',
        features: ['Sterile Clinical Environment', 'Certified Technology', 'Monitored Comfort', 'Post-Care Instructions'],
      },
      {
        id: 'wellness-protocol',
        title: 'Preventative Wellness & Health Screening',
        tagline: 'Proactive wellness management',
        description: 'Preventative screenings and lifestyle wellness programs designed to maintain long-term physical vitality.',
        iconName: 'ShieldCheck',
        features: ['Vitality Screening', 'Biomarker Check', 'Customized Regimen', 'Follow-up Support'],
      },
      {
        id: 'recovery-support',
        title: 'Post-Care Recovery & Maintenance',
        tagline: 'Continuous healing guidance',
        description: 'Dedicated follow-up visits, recovery tracking, and barrier-support regimens ensuring optimal outcomes.',
        iconName: 'Activity',
        features: ['Progress Follow-up', 'Dedicated Coordinator', 'Post-Treatment Kit', 'Direct Line Access'],
      },
    ],

    faqs: [
      {
        question: 'What should I bring to my initial consultation?',
        answer: 'Please bring any relevant prior medical history, a list of current medications or supplements, and any specific questions you have for our practitioners.',
      },
      {
        question: 'Are all procedures performed by licensed professionals?',
        answer: 'Yes, every consultation and treatment is conducted by board-licensed medical and clinical specialists.',
      },
    ],
  },

  // 2. Standardized Industry: Real Estate & Property Advisory
  'real-estate': {
    package: 'both',
    industryProfile: 'real-estate',
    crmTerminology: {
      leadLabel: 'Buyer / Seller / Tenant',
      serviceLabel: 'Property Requirement',
      pipelineStageLabel: 'Deal Stage',
      actionLabel: 'Schedule Viewing',
    },
    defaultFollowUpDays: 2,
    clientId: 'preset-real-estate',
    leadSource: 'Google Search / Property Directory',
    googleBusinessProfileUrl: '',
    businessPhone: '',
    serviceArea: '',

    industry: 'Real Estate & Property Advisory',
    businessName: 'Vanguard Realty & Advisory',
    tagline: 'Premium Residential & Commercial Property Solutions',
    heroTitle: 'Find Your Ideal Home, Commercial Space, or Investment Property',
    heroSubheadline: 'Curated residential sales, commercial leasing, and property investment guidance with verified documentation and transparent representation.',
    heroStatusText: 'NEW EXCLUSIVE LISTINGS AVAILABLE',
    heroSecondaryCtaText: 'View Featured Listings',
    leadFormStatusText: 'SCHEDULE A PRIVATE VIEWING',
    leadFormTrustText: '🔒 Verified property listings. Zero spam guarantee.',
    finalCtaHeading: 'Ready to Acquire or List Your Property?',
    finalCtaDescription: 'Connect with a certified local real estate advisor to receive tailored market analysis and exclusive inventory.',
    finalCtaButtonText: 'Request Property Consultation',
    servicesEyebrow: 'REAL ESTATE SERVICES',
    servicesHeading: 'Comprehensive Property & Advisory Solutions',
    servicesDescription: 'End-to-end guidance from initial search and site visits to contract negotiation, legal vetting, and closing.',
    whyUsHeading: 'Why Buyers & Property Owners Choose Vanguard',
    serviceAreaHeading: 'Serving Prime Residential & Commercial Districts',
    serviceAreaDescription: 'Local advisory presence in key metropolitan neighborhoods and commercial growth corridors.',
    yearsInBusiness: 0,
    jobsCompleted: '',
    averageRating: 0,
    reviewCount: 0,

    phone: '',
    phoneRaw: '',
    email: '',
    address: '',
    cityStateZip: '',
    businessHours: 'Mon-Sat: 9:00 AM - 7:00 PM',
    emergencyAvailability: '',
    whatsAppNumber: '',
    defaultCountryCode: '+1',
    whatsAppMessageTemplate: 'Hi {name}, thank you for inquiring with {businessName} regarding {service}. We have several verified options matching your requirements. When would you like to schedule a viewing?',

    primaryColor: '#0F172A',
    accentColor: '#D97706',
    fontFamily: 'Inter, sans-serif',
    logoUrl: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=200&auto=format&fit=crop&q=80',
    heroImageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&auto=format&fit=crop&q=80',
    aboutImageUrl: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&auto=format&fit=crop&q=80',

    googleMapsLink: '',
    googleMapsEmbedUrl: '',
    googleReviewLink: '',
    googleBusinessProfileLink: '',
    formEndpoint: '',
    googleAnalyticsId: '',
    facebookPixelId: '',
    googleTagManagerId: '',

    socialLinks: {},

    seo: {
      title: 'Vanguard Realty & Advisory | Residential & Commercial Property',
      metaDescription: 'Trusted real estate advisory for residential sales, luxury rentals, and commercial acquisitions.',
      keywords: ['Real estate advisory', 'Property sales', 'Commercial leasing', 'Property valuation'],
      ogImageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&auto=format&fit=crop&q=80',
      canonicalUrl: '',
    },

    serviceAreas: [],
    stats: [],
    testimonials: [],
    beforeAfter: [],
    financingEnabled: false,
    hasEmergencyService: false,

    whyUsItems: [
      { title: '100% Verified Titles', description: 'Strict legal vetting and clear title checks before listing any property.' },
      { title: 'Upfront Market Comparables', description: 'Data-driven pricing insights with zero artificial markup or hidden brokerage.' },
      { title: 'Dedicated Deal Negotiator', description: 'Experienced transaction managers ensuring seamless registration and handover.' },
    ],

    trustBadges: [
      { title: 'Licensed Brokers', subtitle: 'Board Registered', icon: 'ShieldCheck' },
      { title: 'Verified Listings', subtitle: '100% Legally Audited', icon: 'CheckCircle' },
      { title: 'Transparent Deals', subtitle: 'Zero Hidden Costs', icon: 'DollarSign' },
    ],

    services: [
      {
        id: 'residential-sales',
        title: 'Residential Property Sales & Acquisition',
        tagline: 'Premium apartments, villas & homes',
        description: 'Personalized property hunting, curated shortlists, escorted site visits, and purchase negotiations.',
        iconName: 'Home',
        features: ['Curated Shortlists', 'Escorted Site Visits', 'Price Negotiation', 'Registration Support'],
        popular: true,
      },
      {
        id: 'luxury-leasing',
        title: 'Luxury Leasing & Tenant Relocation',
        tagline: 'Turnkey rental management',
        description: 'High-end furnished and unfurnished rentals with comprehensive lease agreements and tenant vetting.',
        iconName: 'Key',
        features: ['Tenant Background Checks', 'Custom Lease Agreements', 'Move-In Condition Audits', 'Relocation Support'],
      },
      {
        id: 'commercial-acquisition',
        title: 'Commercial Office & Retail Leasing',
        tagline: 'High-traffic commercial spaces',
        description: 'Strategic commercial real estate advisory for corporate offices, retail storefronts, and industrial spaces.',
        iconName: 'Building2',
        features: ['Footfall Analysis', 'Zoning & Lease Vetting', 'Fit-out Timelines', 'Long-term Terms'],
      },
      {
        id: 'property-valuation',
        title: 'Property Valuation & Investment Advisory',
        tagline: 'Maximize asset returns',
        description: 'Comparative market analysis, rental yield projections, and asset disposition advisory for property investors.',
        iconName: 'TrendingUp',
        features: ['Market Comps Report', 'Rental Yield Modeling', 'Tax & Legal Guidance', 'Portfolio Rebalancing'],
      },
    ],

    faqs: [
      {
        question: 'How do you verify properties before recommending them?',
        answer: 'Our legal and compliance team verifies title deeds, government approvals, encumbrance certificates, and physical boundaries prior to presenting any property.',
      },
      {
        question: 'Can you assist with home loans and documentation?',
        answer: 'Yes, we partner with leading financial institutions to facilitate mortgage approvals, property agreements, and final registration.',
      },
    ],
  },

  // 3. Standardized Industry: Tarot Coaching & Guidance
  tarot: {
    package: 'both',
    industryProfile: 'tarot',
    crmTerminology: {
      leadLabel: 'Client / Seeker',
      serviceLabel: 'Guidance Reading',
      pipelineStageLabel: 'Session Stage',
      actionLabel: 'Schedule Reading',
    },
    defaultFollowUpDays: 1,
    clientId: 'preset-tarot',
    leadSource: 'Google Search / Online Consultation',
    googleBusinessProfileUrl: '',
    businessPhone: '',
    serviceArea: '',

    industry: 'Tarot Coaching & Guidance',
    businessName: 'Tarot Coaching & Guidance',
    tagline: 'Personal Guidance & Tarot Coaching Services',
    heroTitle: 'Personal Guidance & Tarot Coaching',
    heroSubheadline: 'Insightful tarot reading and coaching sessions for personal growth, career clarity, and relationship guidance.',
    heroStatusText: 'ONLINE & IN-PERSON SESSIONS AVAILABLE',
    heroSecondaryCtaText: 'Request Guidance',
    leadFormStatusText: 'SESSIONS AVAILABLE',
    leadFormTrustText: '🔒 Your information is private and never shared.',
    finalCtaHeading: 'Request a Guidance Session',
    finalCtaDescription: 'Tell us what guidance or session you are looking for and our team will get back to you promptly.',
    finalCtaButtonText: 'Request Session',
    servicesEyebrow: 'OUR TAROT & COACHING SERVICES',
    servicesHeading: 'Personal Readings & Coaching Sessions',
    servicesDescription: 'Insightful tarot readings, personal coaching, and guidance sessions tailored for career, relationships, and personal development.',
    whyUsHeading: 'Why Clients Choose Our Tarot Coaching',
    serviceAreaHeading: 'Tarot Coaching & Global Video Consultations',
    serviceAreaDescription: 'Providing personal in-person coaching and convenient online guidance sessions worldwide.',
    yearsInBusiness: 0,
    jobsCompleted: '',
    averageRating: 0,
    reviewCount: 0,

    phone: '',
    phoneRaw: '',
    email: '',
    address: '',
    cityStateZip: '',
    businessHours: 'Mon-Sat: 9:00 AM - 7:00 PM',
    emergencyAvailability: '',
    whatsAppNumber: '',
    defaultCountryCode: '+91',
    whatsAppMessageTemplate: 'Hi {name}, thank you for reaching out to {businessName} regarding your Tarot Reading session ({service}). When would you like to schedule your guidance reading?',

    primaryColor: '#2E1065',
    accentColor: '#D97706',
    fontFamily: 'Inter, sans-serif',
    logoUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=200&auto=format&fit=crop&q=80',
    heroImageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200&auto=format&fit=crop&q=80',
    aboutImageUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=800&auto=format&fit=crop&q=80',

    googleMapsLink: '',
    googleMapsEmbedUrl: '',
    googleReviewLink: '',
    googleBusinessProfileLink: '',
    formEndpoint: '',
    googleAnalyticsId: '',
    facebookPixelId: '',
    googleTagManagerId: '',

    socialLinks: {},

    seo: {
      title: 'Tarot Coaching & Guidance | Personal Tarot & Life Guidance',
      metaDescription: 'Personal tarot reading, relationship guidance, and career coaching sessions online and in-person.',
      keywords: ['Tarot coaching', 'Personal guidance', 'Online tarot reading', 'Career clarity'],
      ogImageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200&auto=format&fit=crop&q=80',
      canonicalUrl: '',
    },

    serviceAreas: [],
    stats: [],
    testimonials: [],
    beforeAfter: [],
    financingEnabled: false,
    hasEmergencyService: false,

    whyUsItems: [
      { title: 'Empathetic Guidance', description: 'Compassionate, non-judgmental environment focused on personal clarity.' },
      { title: 'Structured Coaching', description: 'Actionable steps and structured reflection following every tarot reading.' },
      { title: 'Flexible Sessions', description: 'Convenient online video consultations as well as in-person sessions.' },
    ],

    trustBadges: [
      { title: '100% Confidential', subtitle: 'Private Consultations', icon: 'ShieldCheck' },
      { title: 'Certified Guidance', subtitle: 'Actionable Insights', icon: 'Sparkles' },
      { title: 'Worldwide Access', subtitle: 'Online Video Sessions', icon: 'Globe' },
    ],

    services: [
      {
        id: 'tarot-reading-session',
        title: 'Personal Tarot Reading',
        tagline: 'Deep insights for life decisions',
        description: 'A comprehensive one-on-one session covering personal growth, decision-making, and self-reflection.',
        iconName: 'Sparkles',
        features: ['One-on-One Session', 'Card Spread Analysis', 'Actionable Insights', 'Question Q&A'],
        popular: true,
      },
      {
        id: 'relationship-coaching',
        title: 'Relationship & Harmony Guidance',
        tagline: 'Clarity in interpersonal connections',
        description: 'Guided sessions to gain perspective on relationships, communication, and emotional harmony.',
        iconName: 'Heart',
        features: ['Connection Analysis', 'Communication Guidance', 'Perspective Building', 'Confidential Support'],
      },
      {
        id: 'career-life-coaching',
        title: 'Career & Life Path Coaching',
        tagline: 'Direction for career goals',
        description: 'Focused coaching to evaluate professional choices, transition goals, and personal aspirations.',
        iconName: 'Compass',
        features: ['Career Assessment', 'Goal Alignment', 'Obstacle Navigation', 'Action Planning'],
      },
      {
        id: 'yearly-forecast',
        title: 'Annual Forecast & Transition Overview',
        tagline: 'Strategic life roadmap',
        description: 'Comprehensive 12-month thematic forecast examining key growth milestones and upcoming transitions.',
        iconName: 'Calendar',
        features: ['Month-by-Month Spread', 'Key Energy Themes', 'Strategic Decisions', 'Recorded Summary'],
      },
    ],

    faqs: [
      {
        question: 'What happens during a Tarot Coaching session?',
        answer: 'During the session, we explore your situation and questions using tarot spreads as reflection tools to bring clarity and actionable direction.',
      },
      {
        question: 'Are sessions available online or in-person?',
        answer: 'We offer both in-person sessions and convenient online video consultations accessible from anywhere in the world.',
      },
    ],
  },

  // 4. Standardized Industry: Recruitment & Executive Search
  recruitment: {
    package: 'both',
    industryProfile: 'recruitment',
    crmTerminology: {
      leadLabel: 'Candidate / Hiring Client',
      serviceLabel: 'Role / Staffing Requirement',
      pipelineStageLabel: 'Pipeline Stage',
      actionLabel: 'Schedule Screening',
    },
    defaultFollowUpDays: 2,
    clientId: 'preset-recruitment',
    leadSource: 'Google Search / Professional Network',
    googleBusinessProfileUrl: '',
    businessPhone: '',
    serviceArea: '',

    industry: 'Recruitment & Executive Search',
    businessName: 'Nexus Talent & Executive Search',
    tagline: 'Precision Executive Search & Specialized Talent Acquisition',
    heroTitle: 'Connecting Exceptional Talent with Leading Teams',
    heroSubheadline: 'Tailored executive search, specialized staffing, and technical recruitment solutions designed to scale high-impact teams.',
    heroStatusText: 'ACTIVE SEARCHES & TALENT PLACEMENT ONGOING',
    heroSecondaryCtaText: 'Submit Hiring Mandate',
    leadFormStatusText: 'REQUEST TALENT / CANDIDATE INQUIRY',
    leadFormTrustText: '🔒 Strict professional confidentiality. Mandates and resumes protected.',
    finalCtaHeading: 'Accelerate Your Hiring or Next Career Milestone',
    finalCtaDescription: 'Partner with specialized recruitment consultants who understand technical domains and executive leadership requirements.',
    finalCtaButtonText: 'Start Talent Search',
    servicesEyebrow: 'TALENT SOLUTIONS',
    servicesHeading: 'Specialized Staffing & Executive Headhunting',
    servicesDescription: 'Rigorous vetting, cultural alignment assessments, and discreet executive placements across modern industry verticals.',
    whyUsHeading: 'Why Organizations Trust Our Search Methodology',
    serviceAreaHeading: 'National & Global Executive Placements',
    serviceAreaDescription: 'Supporting hybrid, on-site, and distributed organizations with fast turnaround times and high retention rates.',
    yearsInBusiness: 0,
    jobsCompleted: '',
    averageRating: 0,
    reviewCount: 0,

    phone: '',
    phoneRaw: '',
    email: '',
    address: '',
    cityStateZip: '',
    businessHours: 'Mon-Fri: 8:30 AM - 6:30 PM',
    emergencyAvailability: '',
    whatsAppNumber: '',
    defaultCountryCode: '+1',
    whatsAppMessageTemplate: 'Hi {name}, thank you for connecting with {businessName} regarding {service}. Our recruitment team would love to discuss your talent mandate or career goals. When are you free for a brief call?',

    primaryColor: '#1E1B4B',
    accentColor: '#2563EB',
    fontFamily: 'Inter, sans-serif',
    logoUrl: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=200&auto=format&fit=crop&q=80',
    heroImageUrl: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=1200&auto=format&fit=crop&q=80',
    aboutImageUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800&auto=format&fit=crop&q=80',

    googleMapsLink: '',
    googleMapsEmbedUrl: '',
    googleReviewLink: '',
    googleBusinessProfileLink: '',
    formEndpoint: '',
    googleAnalyticsId: '',
    facebookPixelId: '',
    googleTagManagerId: '',

    socialLinks: {},

    seo: {
      title: 'Nexus Talent & Executive Search | Specialized Staffing',
      metaDescription: 'Specialized recruitment agency providing executive headhunting, technical staffing, and leadership placement.',
      keywords: ['Executive search', 'Recruitment agency', 'Technical staffing', 'Headhunting firm'],
      ogImageUrl: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=1200&auto=format&fit=crop&q=80',
      canonicalUrl: '',
    },

    serviceAreas: [],
    stats: [],
    testimonials: [],
    beforeAfter: [],
    financingEnabled: false,
    hasEmergencyService: false,

    whyUsItems: [
      { title: 'Deep Domain Expertise', description: 'Specialized recruiters with hands-on technical and industry vertical experience.' },
      { title: 'Pre-Screened Shortlists', description: 'Candidates vetted through competency-based interviews and thorough reference checks.' },
      { title: 'Placement Guarantee', description: '90-day replacement guarantee backed by our ironclad client commitment.' },
    ],

    trustBadges: [
      { title: 'Vetted Talent Pool', subtitle: 'Top 5% Candidates', icon: 'ShieldCheck' },
      { title: 'Confidential Search', subtitle: 'Strict NDA Compliance', icon: 'Award' },
      { title: 'Rapid Turnaround', subtitle: 'Shortlists in 5-7 Days', icon: 'Clock' },
    ],

    services: [
      {
        id: 'executive-search',
        title: 'Executive Search & Leadership Placement',
        tagline: 'C-suite and VP-level headhunting',
        description: 'Discreet search and placement for chief executive, vice president, and board-level leadership roles.',
        iconName: 'Award',
        features: ['Discreet Outreach', 'Leadership Assessment', 'Compensation Benchmarking', 'Offer Negotiation'],
        popular: true,
      },
      {
        id: 'specialized-staffing',
        title: 'Specialized Professional Staffing',
        tagline: 'Critical role fulfillment',
        description: 'Direct-hire sourcing for software engineering, product, finance, and specialized operational professionals.',
        iconName: 'Search',
        features: ['Technical Screening', 'Cultural Fit Assessment', 'Reference Verification', 'Onboarding Support'],
      },
      {
        id: 'interim-staffing',
        title: 'Contract & Interim Project Talent',
        tagline: 'Flexible on-demand staffing',
        description: 'Experienced interim specialists and contract professionals to accelerate mission-critical project timelines.',
        iconName: 'Users',
        features: ['Fast Deployment', 'Compliance Management', 'Flexible Terms', 'Scale-to-Demand'],
      },
      {
        id: 'rpo-advisory',
        title: 'Talent Acquisition & Hiring Advisory',
        tagline: 'Optimize your hiring engine',
        description: 'Recruitment process outsourcing, employer branding advisory, and structured interview rubrics for scaling teams.',
        iconName: 'TrendingUp',
        features: ['Pipeline Auditing', 'Employer Value Proposition', 'Interview Rubrics', 'Cost-per-Hire Optimization'],
      },
    ],

    faqs: [
      {
        question: 'What is your typical timeline for presenting candidate shortlists?',
        answer: 'For professional staffing, we typically deliver a thoroughly screened shortlist within 5 to 7 business days. Executive searches typically present finalists within 2 to 3 weeks.',
      },
      {
        question: 'Do you offer a placement guarantee?',
        answer: 'Yes, all direct-hire placements include a comprehensive 90-day replacement guarantee for complete peace of mind.',
      },
    ],
  },

  // 5. Standardized Industry: Local Business & Professional Services (General Business)
  'general-business': {
    package: 'both',
    industryProfile: 'general-business',
    crmTerminology: {
      leadLabel: 'Client / Enquiry',
      serviceLabel: 'Service Requested',
      pipelineStageLabel: 'Opportunity Stage',
      actionLabel: 'Schedule Service',
    },
    defaultFollowUpDays: 2,
    clientId: 'preset-general-business',
    leadSource: 'Google Search / Local Business Profile',
    googleBusinessProfileUrl: '',
    businessPhone: '',
    serviceArea: '',

    industry: 'Local Business & Professional Services',
    businessName: 'PrimePoint Business & Home Services',
    tagline: 'Reliable Local Business & Professional Services',
    heroTitle: 'Prompt, Reliable Professional Services & Repairs',
    heroSubheadline: 'Certified local specialists providing upfront pricing, fast arrival windows, and guaranteed workmanship on every client project.',
    heroStatusText: 'SPECIALISTS ON DUTY • PROMPT RESPONSE GUARANTEED',
    heroSecondaryCtaText: 'Explore Service Options',
    leadFormStatusText: 'FAST RESPONSE DISPATCH',
    leadFormTrustText: '🔒 Guaranteed upfront quote before any work begins.',
    finalCtaHeading: 'Schedule Your Consultation or Service Visit',
    finalCtaDescription: 'Tell us what needs attention and our client service team will confirm your preferred appointment window.',
    finalCtaButtonText: 'Book Service Call',
    servicesEyebrow: 'WHAT WE DO',
    servicesHeading: 'Dependable Commercial & Residential Services',
    servicesDescription: 'From urgent troubleshooting to scheduled preventative maintenance, we keep operations running smoothly.',
    whyUsHeading: 'Why Local Clients Trust PrimePoint',
    serviceAreaHeading: 'Serving Metro Communities & Surrounding Areas',
    serviceAreaDescription: 'Local service vehicles and professionals stationed across the metro area for rapid dispatch and on-time arrivals.',
    yearsInBusiness: 0,
    jobsCompleted: '',
    averageRating: 0,
    reviewCount: 0,

    phone: '',
    phoneRaw: '',
    email: '',
    address: '',
    cityStateZip: '',
    businessHours: 'Mon-Sat: 7:30 AM - 6:30 PM',
    emergencyAvailability: '',
    whatsAppNumber: '',
    defaultCountryCode: '+1',
    whatsAppMessageTemplate: 'Hi {name}, thank you for reaching out to {businessName} regarding your request for {service}. When is the best time for our team to follow up with an estimate?',

    primaryColor: '#0F172A',
    accentColor: '#0284C7',
    fontFamily: 'Inter, sans-serif',
    logoUrl: 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=200&auto=format&fit=crop&q=80',
    heroImageUrl: 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=1200&auto=format&fit=crop&q=80',
    aboutImageUrl: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=800&auto=format&fit=crop&q=80',

    googleMapsLink: '',
    googleMapsEmbedUrl: '',
    googleReviewLink: '',
    googleBusinessProfileLink: '',
    formEndpoint: '',
    googleAnalyticsId: '',
    facebookPixelId: '',
    googleTagManagerId: '',

    socialLinks: {},

    seo: {
      title: 'PrimePoint Business & Home Services | Reliable Local Services',
      metaDescription: 'Trusted residential and commercial maintenance, diagnostics, and repairs with guaranteed flat-rate pricing.',
      keywords: ['Local services', 'Business maintenance', 'Professional repairs', 'Upfront pricing'],
      ogImageUrl: 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=1200&auto=format&fit=crop&q=80',
      canonicalUrl: '',
    },

    serviceAreas: [],
    stats: [],
    testimonials: [],
    beforeAfter: [],
    financingEnabled: false,
    hasEmergencyService: true,

    whyUsItems: [
      { title: 'Guaranteed Flat-Rate Quotes', description: 'Written estimates provided before any work begins. Zero surprise fees.' },
      { title: 'Background-Checked Technicians', description: 'Experienced, polite specialists who treat your facility with respect.' },
      { title: '1-Year Warranty on Work', description: 'We stand behind our craftsmanship with an ironclad satisfaction guarantee.' },
    ],

    trustBadges: [
      { title: 'Licensed & Insured', subtitle: 'Full Liability Coverage', icon: 'ShieldCheck' },
      { title: 'Upfront Flat Rates', subtitle: 'Zero Hidden Surcharges', icon: 'DollarSign' },
      { title: '1-Year Workmanship', subtitle: 'Guaranteed Repairs', icon: 'Award' },
    ],

    services: [
      {
        id: 'diagnostic-inspection',
        title: 'Full System Diagnostic & Inspection',
        tagline: 'Accurate problem identification',
        description: 'Comprehensive inspection with a written checklist and flat-rate service proposal.',
        iconName: 'Search',
        features: ['Multi-Point Inspection', 'Written Diagnostic Report', 'No-Pressure Recommendations', 'Guaranteed Pricing'],
        popular: true,
      },
      {
        id: 'priority-service',
        title: 'Priority Troubleshooting & Repair',
        tagline: 'Rapid problem resolution',
        description: 'Fast dispatch for urgent residential or business operational issues and equipment faults.',
        iconName: 'Clock',
        features: ['Same-Day Scheduling', 'Fully Stocked Vans', 'Clean Workspace Promise', '1-Year Parts Warranty'],
      },
      {
        id: 'preventative-servicing',
        title: 'Preventative Maintenance & Servicing',
        tagline: 'Extend equipment longevity',
        description: 'Scheduled multi-point servicing to prevent costly unexpected failures and improve efficiency.',
        iconName: 'CheckCircle',
        features: ['Seal & Component Check', 'Lubrication & Calibration', 'Performance Testing', 'Safety Compliance Audit'],
      },
      {
        id: 'system-installation',
        title: 'Fixture & Hardware Installation',
        tagline: 'Professional upgrade execution',
        description: 'Professional replacement and secure mounting of commercial fixtures and smart utility connections.',
        iconName: 'Tool',
        features: ['Clean Code Compliance', 'Disposal of Old Hardware', 'Operational Demonstration', 'Workmanship Guarantee'],
      },
    ],

    faqs: [
      {
        question: 'Do you provide written estimates before starting work?',
        answer: 'Yes, always. We diagnose the issue, explain the options in plain language, and give you a guaranteed flat-rate price before turning a single screw.',
      },
      {
        question: 'Are all your specialists licensed and insured?',
        answer: 'Yes, every technician on our team is fully licensed, insured, and background-vetted for your total peace of mind.',
      },
    ],
  },
};

// Aliases for seamless developer and client ergonomics
INDUSTRY_PRESETS['realestate'] = INDUSTRY_PRESETS['real-estate'];
INDUSTRY_PRESETS['general'] = INDUSTRY_PRESETS['general-business'];
INDUSTRY_PRESETS['skin-clinic'] = INDUSTRY_PRESETS['clinic'];

// Standardized list of the six core industry profile keys
export const STANDARDIZED_INDUSTRIES = [
  'clinic',
  'plumbing',
  'real-estate',
  'tarot',
  'recruitment',
  'general-business',
] as const;

