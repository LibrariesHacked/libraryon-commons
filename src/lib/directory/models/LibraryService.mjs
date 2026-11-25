/**
 * @fileoverview Domain model for local authority library services, managing council-level digital resources, online catalogues, and authority profile pages.
 */

/**
 * Encapsulates a library service / local authority and its shared links and channels.
 */
export class LibraryService {
  /**
   * Construct a LibraryService instance from a canonical directory record.
   *
   * @param {object} record - Canonical authority record matching Table Schema.
   */
  constructor(record = {}) {
    Object.assign(this, record)
    const flat = record.data ? { ...record.data, ...record } : record

    // Extract social media links
    const channels = [
      [['twitter_url', 'Twitter URL'], 'twitter'],
      [['facebook_url', 'Facebook URL'], 'facebook'],
      [['instagram_url', 'Instagram URL'], 'instagram'],
      [['youtube_url', 'YouTube URL'], 'youtube'],
      [['bluesky_url', 'Bluesky URL'], 'bluesky'],
      [['threads_url', 'Threads URL'], 'threads'],
      [['linkedin_url', 'LinkedIn URL'], 'linkedin'],
      [['tiktok_url', 'TikTok URL'], 'tiktok']
    ]
    const social = []
    for (const [fields, channel] of channels) {
      const url = fields.map((f) => flat[f]).find(Boolean)
      if (url) social.push({ channel, url })
    }

    this.name = flat.local_authority || flat['Local authority'] || flat.name || ''
    this.local_authority = this.name
    this.gss = flat.local_authority_code || flat['Local authority code'] || flat.gss || ''
    this.local_authority_code = this.gss
    this.country = flat.country || flat.Country || ''
    this.website = flat.service_url || flat['Service URL'] || flat.website || ''
    this.service_url = this.website
    this.phone = flat.phone_number || flat['Phone number'] || flat.phone || ''
    this.phone_number = this.phone
    this.email = flat.email_address || flat['Email address'] || flat.email || ''
    this.email_address = this.email
    this.catalogue = flat.catalogue_url || flat['Catalogue URL'] || flat.catalogue || ''
    this.catalogue_url = this.catalogue
    this.joinOnline = flat.join_online_url || flat['Join online URL'] || flat.joinOnline || ''
    this.join_online_url = this.joinOnline
    this.androidApp = flat.android_app_url || flat['Android app URL'] || flat.androidApp || ''
    this.android_app_url = this.androidApp
    this.iOSApp = flat.ios_app_url || flat['iOS app URL'] || flat.iOSApp || ''
    this.ios_app_url = this.iOSApp
    this.operatingOrganisation =
      flat.operating_organisation ||
      flat['Operating organisation'] ||
      flat.operatingOrganisation ||
      ''
    this.operating_organisation = this.operatingOrganisation
    this.about = flat.about || flat['About the library service'] || undefined
    this.adultFine =
      flat.adult_fine !== null && flat.adult_fine !== undefined ? Number(flat.adult_fine) : null
    this.childFine =
      flat.child_fine !== null && flat.child_fine !== undefined ? Number(flat.child_fine) : null
    this.fineInterval = flat.fine_interval || null
    this.feesUrl = flat.fees_and_charges_url || ''
    this.social = social

    if (!this.library_ids) {
      this.library_ids = []
    }
  }

  /**
   * Whether the authority has one or more social media channels recorded.
   * @type {boolean}
   */
  get hasSocial() {
    return Array.isArray(this.social) && this.social.length > 0
  }

  /**
   * Relative public URL for the authority's directory page.
   * @type {string}
   */
  get url() {
    return `/libraries/${this.slug}/`
  }
}
