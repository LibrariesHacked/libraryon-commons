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
   * @param {object} record - Canonical authority record with `data` matching Table Schema.
   */
  constructor(record) {
    Object.assign(this, record)
    const data = record?.data || record || {}

    // Extract social media links
    const channels = [
      [['Twitter URL', 'twitter_url'], 'twitter'],
      [['Facebook URL', 'facebook_url'], 'facebook'],
      [['Instagram URL', 'instagram_url'], 'instagram'],
      [['YouTube URL', 'youtube_url'], 'youtube'],
      [['Bluesky URL', 'bluesky_url'], 'bluesky'],
      [['Threads URL', 'threads_url'], 'threads'],
      [['LinkedIn URL', 'linkedin_url'], 'linkedin'],
      [['TikTok URL', 'tiktok_url'], 'tiktok']
    ]
    const social = []
    for (const [fields, channel] of channels) {
      const url = fields.map((f) => data[f]).find(Boolean)
      if (url) social.push({ channel, url })
    }

    const hasCanonical = Boolean(data['Local authority'] || data.local_authority)
    if (hasCanonical) {
      this.name = data['Local authority'] || data.local_authority
      this.local_authority = this.name
      this.gss = data['Local authority code'] || data.local_authority_code
      this.local_authority_code = this.gss
      this.country = data.Country || data.country
      this.website = data['Service URL'] || data.service_url
      this.service_url = this.website
      this.phone = data['Phone number'] || data.phone_number
      this.phone_number = this.phone
      this.email = data['Email address'] || data.email_address
      this.email_address = this.email
      this.catalogue = data['Catalogue URL'] || data.catalogue_url
      this.catalogue_url = this.catalogue
      this.joinOnline = data['Join online URL'] || data.join_online_url
      this.join_online_url = this.joinOnline
      this.androidApp = data['Android app URL'] || data.android_app_url
      this.android_app_url = this.androidApp
      this.iOSApp = data['iOS app URL'] || data.ios_app_url
      this.ios_app_url = this.iOSApp
      this.operatingOrganisation =
        data['Operating organisation'] || data.operating_organisation
      this.operating_organisation = this.operatingOrganisation
      this.about =
        data['About the library service'] || data.about || record.about || undefined
      this.social = social
    }

    if (!this.library_ids) {
      this.library_ids = []
    }

    if (!record?.data) {
      Object.defineProperty(this, 'data', {
        value: this,
        enumerable: false,
        configurable: true,
        writable: true
      })
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
