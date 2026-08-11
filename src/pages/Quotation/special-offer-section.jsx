"use client"
import { PlusIcon, TrashIcon } from "../../components/Icons"

const SpecialOfferSection = ({
  quotationData,
  addSpecialOffer,
  removeSpecialOffer,
  handleSpecialOfferChange,
}) => {
  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm">
      <h3 className="text-lg font-medium mb-4 text-center text-orange-600 font-bold">
        Divine Empire's 10th Anniversary Special Offer
      </h3>

      <div className="space-y-4">
        {quotationData.specialOffers && quotationData.specialOffers.length > 0 ? (
          quotationData.specialOffers.map((offer, index) => (
            <div key={index} className="flex items-center gap-2">
              <textarea
                value={offer}
                onChange={(e) => handleSpecialOfferChange(index, e.target.value)}
                className="flex-1 p-3 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500"
                rows={2}
                placeholder={`Enter special offer ${index + 1}...`}
              />
              {quotationData.specialOffers.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeSpecialOffer(index)}
                  className="text-destructive hover:text-destructive p-2"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          ))
        ) : (
          <div className="flex items-center gap-2">
            <textarea
              value=""
              onChange={(e) => handleSpecialOfferChange(0, e.target.value)}
              className="flex-1 p-3 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500"
              rows={2}
              placeholder="Enter special offer 1..."
            />
          </div>
        )}

        {(!quotationData.specialOffers || quotationData.specialOffers.length < 5) && (
          <button
            type="button"
            onClick={addSpecialOffer}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 flex items-center"
            disabled={quotationData.specialOffers && quotationData.specialOffers.length >= 5}
          >
            <PlusIcon className="h-4 w-4 mr-1" />
            Add Special Offer {quotationData.specialOffers ? `(${quotationData.specialOffers.length}/5)` : "(1/5)"}
          </button>
        )}

        {quotationData.specialOffers && quotationData.specialOffers.length >= 5 && (
          <p className="text-sm text-gray-500 italic">Maximum 5 special offers allowed</p>
        )}
      </div>
    </div>
  )
}

export default SpecialOfferSection
