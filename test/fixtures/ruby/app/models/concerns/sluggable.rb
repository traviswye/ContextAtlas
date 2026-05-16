module Sluggable
  extend ActiveSupport::Concern

  included do
    before_validation :generate_slug
    validates :slug, uniqueness: true, allow_blank: true
  end

  class_methods do
    def find_by_slug!(slug)
      find_by!(slug: slug)
    end
  end

  def to_param
    slug.presence || id.to_s
  end

  private

  def generate_slug
    self.slug ||= title.to_s.parameterize if respond_to?(:title)
  end
end
