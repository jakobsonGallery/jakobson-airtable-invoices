export const CONFIG = {
  paris: {
    baseId: "appZQ3yquS8uPXZy6",
    label: "Paris",
    gallery: {
      name: "JAKOBSON GALLERY",
      address: "28, place des Vosges\n75003 Paris - France",
      phone: "+33 6 51 26 77 05",
      email: "paris@jakobsongallery.com",
      website: "www.jakobsongallery.com",
      bank: "Banque : Galerie 28 - 28 Place des Vosges, 75003 Paris",
      iban: "IBAN : FR 76 3006 6100 6100 0209 9930 190",
      bic: "BIC : CMCIFRPP",
      legal: "SARL Galerie 28 - Capital de 5 000 EUR - RCS 491 910 816"
    },
    tables: {
      purchases: "tbln43SRK0PdGH9Gi",
      clients: "tblKxwOtgwwt04IA2",
      artworks: "tblwzvPNp07L2pu4Y"
    },
    fields: {
      clientLink: "fldKj24KajkrU3zFj",
      artworkLink: "fldwBtMqArBGXfpZw",
      price: "fldWP6SqCbemWBIBd",
      paid: "fldBWsCDn7SERcZXs",
      newPayment: "fldDtvFMFCkZzNEVP",
      balance: "fldmpF5jyNdUoTxrA",
      paymentMode: "fldn1j4DaplzvIncm",
      invoiceNumber: "fldAdzPVzcsCf3vdS",
      launch: "fldkeUhMWEocGpJ5u",
      created: "fldsJxb5olgqIV1xu",
      pdfAttachment: "fldZBnx8LVnyEZKQF",
      fallbackAttachment: "fldm2UO9yWCofdZM4",
      clientName: "fldFNWJBk97vFmDXA",
      clientEmail: "fldDTH29dhMVoq8M4",
      clientPhone: "fldJwSugiLuL3yBex",
      clientAddress: "fldErmSsHo1nAXC0J",
      clientPostcode: "fldJmDZ2m3RlrdRoo",
      clientCity: "fldkLixIKxmyMleUx",
      clientRegion: "fld7eHm5fco1USJUY",
      clientCountry: "fldmQuc1eZeDt5B5g",
      artworkTitle: "fldEB4ApP5ajbkg4L",
      artworkArtist: "fldHhZUoLG8Ht5fkZ",
      artworkPhoto: "fldmZixVmqpdLfbym",
      artworkDimensions: "fldZQrcXm9Ds4b36U",
      artworkTechnique: "fldKbkhGxJ975ZA88",
      artworkYear: "fldAdpAj4vf6K785v"
    }
  },
  "saint-tropez": {
    baseId: "appFdB88AmgomcZWY",
    label: "Saint-Tropez",
    gallery: {
      name: "JAKOBSON GALLERY",
      address: "Saint-Tropez - France",
      phone: "+33 6 51 26 77 05",
      email: "paris@jakobsongallery.com",
      website: "www.jakobsongallery.com",
      bank: "Banque : Galerie 28 - 28 Place des Vosges, 75003 Paris",
      iban: "IBAN : FR 76 3006 6100 6100 0209 9930 190",
      bic: "BIC : CMCIFRPP",
      legal: "SARL Galerie 28 - Capital de 5 000 EUR - RCS 491 910 816"
    },
    tables: {
      purchases: "tbln43SRK0PdGH9Gi",
      clients: "tblKxwOtgwwt04IA2",
      artworks: "tblwzvPNp07L2pu4Y"
    },
    fields: {
      clientLink: "fldKj24KajkrU3zFj",
      artworkLink: "fldwBtMqArBGXfpZw",
      price: "fldWP6SqCbemWBIBd",
      paid: "fldBWsCDn7SERcZXs",
      newPayment: "fldDtvFMFCkZzNEVP",
      balance: "fldmpF5jyNdUoTxrA",
      paymentMode: "fldn1j4DaplzvIncm",
      invoiceNumber: null,
      launch: "fldzg6mHMgESVFPg0",
      created: null,
      pdfAttachment: "fldm2UO9yWCofdZM4",
      fallbackAttachment: "fldm2UO9yWCofdZM4",
      clientName: "fldFNWJBk97vFmDXA",
      clientEmail: "fldDTH29dhMVoq8M4",
      clientPhone: "fldJwSugiLuL3yBex",
      clientAddress: "fldErmSsHo1nAXC0J",
      clientPostcode: "fldJmDZ2m3RlrdRoo",
      clientCity: "fldkLixIKxmyMleUx",
      clientRegion: "fld7eHm5fco1USJUY",
      clientCountry: "fldmQuc1eZeDt5B5g",
      artworkTitle: "fldEB4ApP5ajbkg4L",
      artworkArtist: "fldHhZUoLG8Ht5fkZ",
      artworkPhoto: "fldmZixVmqpdLfbym",
      artworkDimensions: "fldZQrcXm9Ds4b36U",
      artworkTechnique: null,
      artworkYear: "fldAdpAj4vf6K785v"
    }
  }
};

export function getBaseConfig(baseKey) {
  const config = CONFIG[baseKey];
  if (!config) {
    throw new Error("Unknown base. Use 'paris' or 'saint-tropez'.");
  }
  return config;
}
