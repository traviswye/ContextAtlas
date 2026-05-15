class PostsController < ApplicationController
  before_action :set_post, only: %i[show update destroy]

  def index
    @posts = Post.published.includes(:user)
  end

  def show
  end

  def create
    @post = current_user.posts.build(post_params)
    if @post.save
      redirect_to @post
    else
      render :new
    end
  end

  def update
    if @post.update(post_params)
      redirect_to @post
    else
      render :edit
    end
  end

  def destroy
    @post.destroy
    redirect_to posts_path
  end

  private

  def set_post
    @post = Post.find_by_slug!(params[:slug])
  end

  def post_params
    params.require(:post).permit(:title, :body, :status)
  end
end
