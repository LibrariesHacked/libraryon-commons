export interface LibraryData {
  'Local authority': string | null
  'Local authority code': string | null
  'Library name': string | null
  'Library code': string | null
  'Address 1': string | null
  'Address 2': string | null
  'Address 3': string | null
  Postcode: string | null
  'Unique property reference number': number | null
  Latitude: number | null
  Longitude: number | null
  Status: 'Open' | 'Closed (permanent)' | 'Closed (temporary)' | 'Planned' | null
  Statutory: 'Yes' | 'No' | null
  'Facility type':
    | 'Static library'
    | 'Static local history library'
    | 'Archive'
    | 'Mobile library'
    | 'Prison library'
    | null
  'Type of library': 'LAL' | 'LAL-' | 'CL' | 'CRL' | 'ICL' | null
  'Year opened': number | null
  'Year closed': number | null
  'Monday staffed hours': string | null
  'Tuesday staffed hours': string | null
  'Wednesday staffed hours': string | null
  'Thursday staffed hours': string | null
  'Friday staffed hours': string | null
  'Saturday staffed hours': string | null
  'Sunday staffed hours': string | null
  'Monday unstaffed hours': string | null
  'Tuesday unstaffed hours': string | null
  'Wednesday unstaffed hours': string | null
  'Thursday unstaffed hours': string | null
  'Friday unstaffed hours': string | null
  'Saturday unstaffed hours': string | null
  'Sunday unstaffed hours': string | null
  'Special hours': string | null
  'Weekly staffed hours': number | null
  'Weekly total hours': number | null
  'Automated access system': string | null
  'Co-located': 'Yes' | 'No' | null
  'Co-located with': string | null
  'Guest wifi': 'Yes' | 'No' | null
  'Member wifi': 'Yes' | 'No' | null
  'Public computers': 'Yes' | 'No' | null
  Printing: 'Yes' | 'No' | null
  'Meeting rooms': 'Yes' | 'No' | null
  'Quiet study space': 'Yes' | 'No' | null
  'Step-free access': 'Yes' | 'No' | 'Partial' | null
  'Accessible toilet': 'Yes' | 'No' | null
  'Hearing loop': 'Yes' | 'No' | null
  'Facilities and services': string | null
  'Phone number': string | null
  'Email address': string | null
  URL: string | null
  Notes: string | null
}

export interface LibraryServiceData {
  'Local authority': string | null
  'Local authority code': string | null
  Country: 'England' | 'Scotland' | 'Wales' | 'Northern Ireland' | null
  'Local authority department': string | null
  'Governance model':
    | 'Local authority run'
    | 'Public sector mutual'
    | 'Charitable trust'
    | 'Commissioned contractor'
    | null
  'Operating organisation': string | null
  Consortium: string | null
  'Service URL': string | null
  'Libraries URL': string | null
  'Mobile library URL': string | null
  'Home library service URL': string | null
  'Childrens service URL': string | null
  'Catalogue URL': string | null
  'Join online URL': string | null
  'Events URL': string | null
  'Eventbrite ID': string | null
  'Computer access URL': string | null
  'Wifi access URL': string | null
  'Room booking URL': string | null
  'Volunteer URL': string | null
  'Fees and charges URL': string | null
  'Adult fine': number | null
  'Child fine': number | null
  'Fine interval': string | null
  'Email address': string | null
  'Phone number': string | null
  'App name': string | null
  'Android app URL': string | null
  'iOS app URL': string | null
  'Twitter URL': string | null
  'Facebook URL': string | null
  'Instagram URL': string | null
  'YouTube URL': string | null
  'Blog URL': string | null
  'Podcast URL': string | null
  'Library management system supplier': string | null
  'Library management system': string | null
  'Online catalogue system': string | null
  'Ebook supplier': string | null
  'Ebook URL': string | null
  'Audiobook supplier': string | null
  'Audiobook URL': string | null
  'Emagazine supplier': string | null
  'Enewspaper supplier': string | null
  'Online reference subscriptions': string | null
  'Green library': 'Yes' | 'No' | null
  Notes: string | null
}

export interface ValidationException {
  field: string
  code: string
  value: unknown
  reason: string
}

export interface ManualCheck {
  kind: string
  reason: string
  audit_refs: string[]
}

export interface DirectoryRecord<Data> {
  id?: string | number
  slug: string
  authority?: string
  source_id?: string | number
  source_url?: string
  updated_on?: string | null
  reviewed_on?: string | null
  imported_on?: string
  data: Data
  validation_exceptions: ValidationException[]
  manual_checks?: ManualCheck[]
}

export type LibraryRecord = DirectoryRecord<LibraryData>
export type LibraryServiceRecord = DirectoryRecord<LibraryServiceData>
