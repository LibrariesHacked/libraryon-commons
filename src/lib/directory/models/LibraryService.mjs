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
    const data = record?.data || {}

    // Extract social media links
    const channels = [
      ['Twitter URL', 'twitter'],
      ['Facebook URL', 'facebook'],
      ['Instagram URL', 'instagram'],
      ['YouTube URL', 'youtube']
    ]
    const social = []
    for (const [field, channel] of channels) {
      const url = data[field]
      if (url) social.push({ channel, url })
    }

    if (data && Object.keys(data).length > 0) {
      this.name = data['Local authority']
      this.gss = data['Local authority code']
      this.country = data.Country
      this.website = data['Service URL']
      this.phone = data['Phone number']
      this.email = data['Email address']
      this.catalogue = data['Catalogue URL']
      this.joinOnline = data['Join online URL']
      this.androidApp = data['Android app URL']
      this.iOSApp = data['iOS app URL']
      this.operatingOrganisation = data['Operating organisation']
      this.social = social
    }

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
